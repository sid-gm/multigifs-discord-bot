require("dotenv").config();
const { Client, GatewayIntentBits, Collection, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const fs = require("fs");
const path = require("path");
const { insertVerification, getVerification, updateStatus, setPinAndApprove, deleteVerification } = require("./database");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// Load slash commands
client.commands = new Collection();
const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith(".js"));

for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  client.commands.set(command.data.name, command);
}

client.on("interactionCreate", async interaction => {
  // Slash commands
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    try {
      await command.execute(interaction);
    } catch (err) {
      console.error(err);
      await interaction.reply({ content: "Something went wrong.", ephemeral: true });
    }
    return;
  }

  // Button interactions
  if (!interaction.isButton()) return;

  const { customId, user, member, channel } = interaction;

  // --- User: clicked Yes ---
  if (customId === "verify_yes") {
    const existing = getVerification.get(user.id);
    if (existing) {
      if (existing.status === "pending") {
        return interaction.update({ content: "You already have a pending verification submission.", components: [] });
      }
      if (existing.status === "approved") {
        return interaction.update({ content: "You've already been approved!", components: [] });
      }
      // Rejected — clear the old record so they can reapply
      deleteVerification.run(user.id);
    }

    await interaction.update({
      content: "Please send your example video as a message in this channel. You have 5 minutes.",
      components: []
    });

    const filter = m => m.author.id === user.id && m.attachments.size > 0;

    let collected;
    try {
      collected = await channel.awaitMessages({ filter, max: 1, time: 5 * 60 * 1000, errors: ["time"] });
    } catch {
      await interaction.editReply({ content: "Timed out waiting for your video. Run `/verify` again to restart." });
      return;
    }

    const message = collected.first();
    const attachment = message.attachments.first();
    const videoUrl = attachment.url;
    const guildNickname = member?.displayName ?? user.displayName ?? user.username;

    try {
      insertVerification.run({
        userId: user.id,
        discordUsername: user.username,
        guildNickname,
        videoUrl
      });
    } catch (err) {
      // UNIQUE constraint — submission already exists
      await interaction.editReply({ content: "You already have a pending submission." });
      return;
    }

    await interaction.editReply({ content: "Thanks! Your submission is waiting for admin approval." });

    // Post to admin channel
    const adminChannel = await client.channels.fetch(process.env.ADMIN_CHANNEL_ID).catch(() => null);
    if (!adminChannel) {
      console.error("ADMIN_CHANNEL_ID not found or bot lacks access.");
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle("New Verification Submission")
      .addFields(
        { name: "User", value: `<@${user.id}> (${user.username})`, inline: true },
        { name: "Display Name", value: guildNickname, inline: true },
        { name: "Video", value: videoUrl }
      )
      .setColor(0x5865f2)
      .setTimestamp();

    const adminRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`admin_approve_${user.id}`)
        .setLabel("Approve")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`admin_reject_${user.id}`)
        .setLabel("Reject")
        .setStyle(ButtonStyle.Danger)
    );

    await adminChannel.send({ embeds: [embed], components: [adminRow] });
    return;
  }

  // --- User: clicked No ---
  if (customId === "verify_no") {
    await interaction.update({ content: "No problem! Let us know if you change your mind.", components: [] });
    return;
  }

  // --- Admin: Approve ---
  if (customId.startsWith("admin_approve_")) {
    if (!interaction.memberPermissions?.has("Administrator")) {
      return interaction.reply({ content: "You don't have permission to do this.", ephemeral: true });
    }

    const targetUserId = customId.replace("admin_approve_", "");
    const record = getVerification.get(targetUserId);
    if (!record || record.status !== "pending") {
      return interaction.reply({ content: "This submission is no longer pending.", ephemeral: true });
    }

    const pin = String(Math.floor(100000 + Math.random() * 900000));
    setPinAndApprove.run(pin, targetUserId);

    // Register pre-approval on scrollforme.com
    const scrollformeUrl = process.env.SCROLLFORME_URL;
    const scrollformeToken = process.env.SCROLLFORME_ADMIN_TOKEN;
    if (scrollformeUrl && scrollformeToken) {
      try {
        const res = await fetch(`${scrollformeUrl}/api/pre-approve`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${scrollformeToken}`
          },
          body: JSON.stringify({ discordUsername: record.guild_nickname, pin })
        });
        const text = await res.text();
        console.log(`pre-approve response: ${res.status} ${text}`);
      } catch (err) {
        console.error("Failed to register pre-approval on scrollforme:", err);
      }
    } else {
      console.warn("SCROLLFORME_URL or SCROLLFORME_ADMIN_TOKEN not set — skipping pre-approval registration.");
    }

    // DM the user
    const targetUser = await client.users.fetch(targetUserId).catch(() => null);
    if (targetUser) {
      await targetUser.send(
        `You've been approved for scrollforme.com! Sign in with:\n**Username:** \`${record.guild_nickname}\`\n**PIN:** \`${pin}\``
      ).catch(() => console.warn(`Could not DM user ${targetUserId} — they may have DMs disabled.`));
    }

    // Update admin embed
    const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
      .setColor(0x57f287)
      .setTitle("✅ Verified — Approved")
      .addFields({ name: "PIN Issued", value: pin, inline: true });

    await interaction.update({ embeds: [updatedEmbed], components: [] });
    return;
  }

  // --- Admin: Reject ---
  if (customId.startsWith("admin_reject_")) {
    if (!interaction.memberPermissions?.has("Administrator")) {
      return interaction.reply({ content: "You don't have permission to do this.", ephemeral: true });
    }

    const targetUserId = customId.replace("admin_reject_", "");
    const record = getVerification.get(targetUserId);
    if (!record || record.status !== "pending") {
      return interaction.reply({ content: "This submission is no longer pending.", ephemeral: true });
    }

    updateStatus.run("rejected", targetUserId);

    const targetUser = await client.users.fetch(targetUserId).catch(() => null);
    if (targetUser) {
      await targetUser.send(
        "Your scrollforme.com verification was not approved. Contact an admin if you have questions."
      ).catch(() => console.warn(`Could not DM user ${targetUserId} — they may have DMs disabled.`));
    }

    const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
      .setColor(0xed4245)
      .setTitle("❌ Verified — Rejected");

    await interaction.update({ embeds: [updatedEmbed], components: [] });
    return;
  }
});

client.once("clientReady", () => {
  console.log(`Bot logged in as ${client.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);
