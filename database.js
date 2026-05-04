const Database = require("better-sqlite3");
const db = new Database("verifications.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS verifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL UNIQUE,
    discord_username TEXT NOT NULL,
    guild_nickname TEXT,
    video_url TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    pin TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

const insertVerification = db.prepare(`
  INSERT INTO verifications (user_id, discord_username, guild_nickname, video_url)
  VALUES (@userId, @discordUsername, @guildNickname, @videoUrl)
`);

const getVerification = db.prepare(`
  SELECT * FROM verifications WHERE user_id = ?
`);

const updateStatus = db.prepare(`
  UPDATE verifications SET status = ? WHERE user_id = ?
`);

const setPinAndApprove = db.prepare(`
  UPDATE verifications SET status = 'approved', pin = ? WHERE user_id = ?
`);

const deleteVerification = db.prepare(`
  DELETE FROM verifications WHERE user_id = ?
`);

module.exports = { insertVerification, getVerification, updateStatus, setPinAndApprove, deleteVerification };
