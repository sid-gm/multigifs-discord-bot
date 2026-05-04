const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("verify")
    .setDescription("Begin the uploader verification process"),

  async execute(interaction) {
    const modal = new ModalBuilder()
      .setCustomId("verifyModal")
      .setTitle("Upload Access Verification");

    const wantUpload = new TextInputBuilder()
      .setCustomId("wantUpload")
      .setLabel("Do you want to upload to scrollforme.com? (yes/no)")
      .setStyle(TextInputStyle.Short);

    const exampleVid = new TextInputBuilder()
      .setCustomId("exampleVid")
      .setLabel("Paste a link to an example video:")
      .setStyle(TextInputStyle.Paragraph);

    modal.addComponents(
      new ActionRowBuilder().addComponents(wantUpload),
      new ActionRowBuilder().addComponents(exampleVid)
    );

    await interaction.showModal(modal);
  }
};