const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("verify")
    .setDescription("Begin the uploader verification process"),

  async execute(interaction) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("verify_yes")
        .setLabel("Yes")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("verify_no")
        .setLabel("No")
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({
      content: "Do you want to upload to scrollforme.com?",
      components: [row],
      ephemeral: true
    });
  }
};
