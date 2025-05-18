import {GameController,} from "./gameController.js";
import {defaultConsoleLogging}     from "../kolibri/logger/loggingSupport.js";
import {projectGame}             from "./gameProjector.js";
import {connect}                 from "../server/S8-OM-SSE/connect.js";
import {OM}                      from "./observableMap/om.js";

defaultConsoleLogging("ch.fhnw", LOG_DEBUG);

const om = OM("index.html");

connect(window.location.origin, om);

const gameController = GameController(om);

gameController.startGame(_ => {
    document.body.append(...projectGame(gameController));
});
