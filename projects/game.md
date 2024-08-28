# Game

A game is an interface that defines how the client and server render a game mode.

[What is an interface](#https://stackoverflow.com/a/2867064)

# Game Interface

game.AwaitAllLoaded() bool
game.BeginGame()
game.AcceptAttempt(playerid int, attempt string) AttemptResults
game.EmitGameStates() GameStats
game.EndGame() GameStats
game.RankPlayers() []Player

## Features of Game
ID
ShortName
Description
MaxPlayers Maximum number of players allowed to particpate
Players Collection of Players participating in game

