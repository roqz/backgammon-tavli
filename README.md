# BackgammonTavli

This project was generated with [Angular CLI](https://github.com/angular/angular-cli) version 1.7.3.

## Development server

Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`. The app will automatically reload if you change any of the source files.

## Code scaffolding

Run `ng generate component component-name` to generate a new component. You can also use `ng generate directive|pipe|service|class|guard|interface|enum|module`.

## Build

Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory. Use the `-prod` flag for a production build.

## Running unit tests

Run `ng test` to execute the unit tests via [Karma](https://karma-runner.github.io).

## Running end-to-end tests

Run `ng e2e` to execute the end-to-end tests via [Protractor](http://www.protractortest.org/).

## Further help

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI README](https://github.com/angular/angular-cli/blob/master/README.md).

## Open Features

- implementation of missing backgammon game rules (es müssen so viele Züge wie möglich gespielt werden, wenn nur einer der beiden geht aber beide gehen dann der höhere)

- implement doubler dice
- implementation of backgammon variations Tavli, Plakkato, Portes

- Svg Responsiveness 
- UI to select players and start games 
- computer AI
- revert move 
- drag and drop 
- statistics
- configurable colors and start positions 

- game history notation at the moment with static board numbers (24 top right to 1 bottom right), must be from players view
- game history ui

- create optional server/ multi-player mode with signal r
- random numbers from server
- server logic validation 
- greenkeeper.io
- Play Game from history 

## Implemented

- Game history with print to official backgammon notation 
- Checker Move Animations
- implementation of state handling with ngrx
- implement gammon and backgammon / points
- bug in getpossiblemoves calculation, needs unit tests