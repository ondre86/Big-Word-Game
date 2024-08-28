-- Notes; 
-- Date additions to scripts in comments.
-- Before inserting a change; cleanup the change.
-- No foreign keys
DROP TABLE IF EXISTS playerSessionToken;
CREATE TABLE playerSessionToken (
    token text not null,
    playerId int not null,
    createdAt timestamp not null,
    expiresAt timestamp not null
);

DROP TABLE IF EXISTS player;
CREATE TABLE player (
    id int not null,
    username text not null,
    password text not null
);

DROP TABLE IF EXISTS lobby;
CREATE TABLE lobby (
    id int not null
);
TRUNCATE TABLE lobby;
INSERT INTO lobby (id) VALUES (1); 

DROP TABLE IF EXISTS gameRoom;
CREATE TABLE gameRoom (
    id int not null,
    ownerPlayerId int not null,
    shortName text not null,
    selectedGameId int,
    password text,
    players text,
    playersReady text,
    createdAt timestamp,
    expiresAt timestamp
);

DROP TABLE IF EXISTS game;
CREATE TABLE game (
    id int not null,
    stats json
);



