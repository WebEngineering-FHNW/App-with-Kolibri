import {GameController,}       from "./game/gameController.js";
import {defaultConsoleLogging} from "../kolibri/logger/loggingSupport.js";
import {projectGame}           from "./game/gameProjector.js";
import {connect}               from "../server/S8-OM-SSE/connect.js";
import {LOG_DEBUG, LOG_WARN}   from "../kolibri/logger/logLevel.js";
import {ObservableMap}         from "../kolibri/observable/observableMap.js";

defaultConsoleLogging("ch.fhnw.tetris", LOG_INFO);

const om = ObservableMap("index.html");

connect(window.location.origin, om);

const gameController = GameController(om);

gameController.startGame(_ => {
    document.body.append(...projectGame(gameController));
});
