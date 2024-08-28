# Lobby

Entrypoint to create new games, invite players to games, and preform other menu and administrative tasks

## Functions of a lobby

lobby.Register(username string, password string) bool
lobby.Login(username string, password string) (jwt string)
lobby.NewGameRoom(playerid int, shortName) GameRoom
lobby.JoinGameRoom(playerid int, gameroomid int, password string) GameRoom
lobby.ListGameRooms() []GameRoom
lobby.GetLastPlayerHistory() PlayerHistory

