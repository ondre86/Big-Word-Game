# Game Rooms

A Game Room is an area where players can select a game, learn rules to the game, and start when all players have joined. Game Rooms close after 30 minutes and can have multiple games started by the leader and participantes

## Functions of a game room

NewGameRoom(playerid, shortName, password string) GameRoom
ListGameRooms() []GameRoom
JoinGameRoom(playerId int, password string) GameRoom
MakeGameRoomOwner(playerId int)
gameRoom.PlayerReady(playerId int, isReady bool)
gameRoom.Start() Game

## Features of a Game Room

ID - unique identifier generated on creation
Games - list of potential games the player(s) can play
SelectedGameID - current game queued up to participate in
Players - list of players queued up to play the game in this room
PlayerScores - map of scores to player IDs
GameRoomOwnerPlayerID - current player who owns the game room
CreatedAt - when the room was created
ClosesAt - when the game room will close







