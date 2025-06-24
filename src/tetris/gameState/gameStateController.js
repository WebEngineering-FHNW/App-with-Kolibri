/**
 * @module tetris/gameStateContoller
 */

import {LoggerFactory}                        from "../../kolibri/logger/loggerFactory.js";
import {Observable}                           from "../../kolibri/observable.js";
import {MISSING_FOREIGN_KEY, PREFIX_IMMORTAL} from "../../extension/relationalModelType.js";
import {GameState, NO_GAME_STATE}             from "./gameStateModel.js";

export {
    GameStateController,
    GAME_STATE,
};

const log = LoggerFactory("ch.fhnw.tetris.gameState.gameStateController");

const GAME_STATE  = /** @type { ForeignKeyType } */ PREFIX_IMMORTAL + "GAME_STATE";

// --- game controller --- --- --- --- --- --- --- --- --- --- --- --- --- ---

/**
 * @typedef GameStateControllerType
 * @property setup
 * @property onGameStateChanged
 * @property updateScore
 * @property setFallingDown
 * @property isFallingDown
 * @property resetGameState
 * @property startListening
 */

/**
 * @constructor
 * @param { ObservableMapType } om
 * @param { Function } omPublishStrategy - the strategy on how to set values on the OM
 * @returns { GameStateControllerType }
 */
const GameStateController = (om, omPublishStrategy) => {

// --- Observable Map centralized access --- --- ---

    /**
     * @param { GameStateModelType } gameState
     */
    const publish = gameState => omPublishStrategy ( _=> om.setValue(gameState.id, gameState) ) ;

// --- game state --- --- --- --- --- --- --- --- ---

    /** @type { IObservable<GameStateModelType> } */
    const gameStateObs = Observable(NO_GAME_STATE);

    const updateScore = changeFn => {
        const oldGameState = gameStateObs.getValue();
        if(oldGameState.id === MISSING_FOREIGN_KEY) {
            log.error("cannot update missing game state");
            return;
        }
        const newGameState = /** @type { GameStateModelType } */ {...oldGameState};
        newGameState.score = changeFn(oldGameState.score);
        // gameStateObs.setValue(newGameState); // eager update to avoid lost update
        publish(newGameState);
    };

    const setFallingDown = newValue => {
        const oldGameState = gameStateObs.getValue();
        if(oldGameState.id === MISSING_FOREIGN_KEY) {
            log.error("cannot set falling to missing game state");
            return;
        }
        if (oldGameState.fallingDown === newValue) { // no change, nothing to publish
            return;
        }
        const newGameState       = /** @type { GameStateModelType } */ {...oldGameState};
        newGameState.fallingDown = newValue;
        gameStateObs.setValue(newGameState); // eager update ???
        publish(newGameState);   // lazy update to not start the fall task twice
    };

    const isFallingDown = () => {
        return gameStateObs.getValue().fallingDown;
    };

    const resetGameState = () => {
        const initialState = GameState(GAME_STATE, false, 0);
        gameStateObs.setValue(initialState); // todo: eager update really a good idea here?
        publish(initialState);
    };

    const setup = () => {
        if(gameStateObs.getValue().id === MISSING_FOREIGN_KEY) {
            log.info("we are the first user - creating game state");
            const gameState = GameState(GAME_STATE, false, 0);
            gameStateObs.setValue(gameState); // esp. at startup we want to be eager
            publish(gameState);
        }
    };

    const startListening = () => {
        om.onChange( (key,value) => {
            if (GAME_STATE === key) {
                gameStateObs.setValue(value);
            }
        });
    };


    return {
        setup,
        onGameStateChanged          : gameStateObs.onChange,
        updateScore,
        setFallingDown,
        isFallingDown,
        resetGameState,
        startListening
    }
};
