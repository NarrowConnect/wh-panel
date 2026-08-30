ALTER TABLE conversations DROP COLUMN IF EXISTS first_response_at;
ALTER TABLE conversations DROP COLUMN IF EXISTS resolved_at;
ALTER TABLE conversations DROP COLUMN IF EXISTS sentiment_score;

ALTER TABLE messages DROP COLUMN IF EXISTS sentiment;
ALTER TABLE messages DROP COLUMN IF EXISTS sentiment_score;
