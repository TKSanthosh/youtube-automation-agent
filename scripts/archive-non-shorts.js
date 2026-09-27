const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('data/youtube_automation.db');
db.run("UPDATE ai_content_suggestions SET status = 'archived_non_short' WHERE target_length != 'short' AND status = 'pending'", function(err) {
  if (err) console.error(err);
  else console.log('Archived non-shorts:', this.changes);
  db.close();
});
