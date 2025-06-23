import {dom}           from "../../kolibri/util/dom.js";
import {LoggerFactory} from "../../kolibri/logger/loggerFactory.js";

export { projectGameState };

const log = LoggerFactory("ch.fhnw.tetris.gameState.gameStateProjector");

/**
 * @param { GameStateControllerType } gameStateController
 * @return { HTMLCollection }
 */
const projectGameState = gameStateController => {
    const view = dom(`
        <div class="score">0</div>
    `);
    const scoreDiv = view[0];

    // data binding

    gameStateController.onGameStateChanged( /** @type { GameStateModelType } */ gameState => {
        scoreDiv.textContent = gameState.score;
    });

    return view;
};
