-- Reverses 0001_init.
--
-- This is destructive and is never run by the server or by `migrate up`. It
-- exists so a development database can be rebuilt deliberately, via
-- `migrate down`, which requires an explicit confirmation flag.

DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS conversation_participants;
DROP TABLE IF EXISTS conversations;
DROP TABLE IF EXISTS favorites;
DROP TABLE IF EXISTS apartment_amenities;
DROP TABLE IF EXISTS apartment_images;
DROP TABLE IF EXISTS apartments;
DROP TABLE IF EXISTS amenities;
DROP TABLE IF EXISTS districts;
DROP TABLE IF EXISTS users;
