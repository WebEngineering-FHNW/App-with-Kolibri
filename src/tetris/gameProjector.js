import                                                       "../kolibri/util/array.js";
import {dom, select}                                    from "../kolibri/util/dom.js";
import {registerForMouseAndTouch}                       from "./scene3D/scene.js";
import {LoggerFactory}                                  from "../kolibri/logger/loggerFactory.js";
import {MISSING_FOREIGN_KEY}                            from "../extension/relationalModelType.js";
import {
    moveBack,
    moveDown,
    moveForw,
    moveLeft,
    moveRight,
    rotateYaw,
    topplePitch,
    toppleRoll
} from "./tetrominoController.js";
import {projectPlayerList}                              from "./player/playerProjector.js";

export {projectGame};

const log = LoggerFactory("ch.fhnw.kolibri.tetris.gameProjector");

/**
 * Create the control panel view and bind to the controller actions
 * @param { GameControllerType } gameController
 * @return { HTMLCollection }
 */
const projectControlPanel = gameController => {
    const view              = dom(`
    <header>
        <div class="self"><input size=10></div>
        <button>Start/Restart</button>
    </header>`);

    const [header]          = view;

    const playerController = gameController.playerController;
    header.append(...projectPlayerList(playerController));
    header.append(...dom(`<div class="score">0</div>`));

    const [selfInput]       = select(header, "div.self input");
    const [startButton]     = select(header, "button");
    const [scoreDiv]        = select(header, "div.score");

    // data binding

    playerController.onActivePlayerIdChanged( _ => {
        if (playerController.areWeInCharge()) {
            header.classList.add("active");
        } else {
            header.classList.remove("active");
        }
    });

    gameController.onGameStateChanged( /** @type { GameStateModelType } */ gameState => {
        scoreDiv.textContent = gameState.score;
    });


    const updatePlayerNameInput = player  => {
        if(playerController.thisIsUs(player)) {
            selfInput.value = player.name;
        }
    };
    playerController.onPlayerAdded  ( updatePlayerNameInput);
    playerController.onPlayerChanged( updatePlayerNameInput);

    // view Binding
    selfInput.oninput = _event => {
        playerController.setOwnName( selfInput.value );
    };

    // Using direct property assignment (onclick) overwrites any previous listeners
    // Only the last assignment will be executed when the button is clicked
    startButton.onclick = _ => gameController.restart();

    return view;
};

/**
 * Create the main view and bind to the main key bindings
 * @impure sets the main view
 * @param { GameControllerType } gameController
 * @return { HTMLCollection }
 */
const projectMain = gameController => {
    const mainElements = dom(`
        <main id="main" class="scene3d noSelection">
            <div class="coords" style="
                    --coords-rotate-x:  85;
                    --coords-rotate-y: -15;
                    top:                60cqh;
            ">
                <div class="floor">
                    <div class="toplight"></div>
                </div>
                <div class="plane show xz-plane"></div>
                <div class="plane show yz-plane"></div>
                <!--    tetrominos to be added here -->
            </div>
        </main>
        <footer>
            Use mouse or touch to rotate the coords.
            Arrow keys to move the tetromino.
            Shift + arrow keys to rotate.
        </footer>`
    );

    // view binding
    const main = mainElements[0];
    registerForMouseAndTouch(main);           // the general handling of living in a 3D scene
    registerKeyListener(gameController);      // the game-specific key bindings

    gameController.onTetrominoAdded( tetromino => {
        if (tetromino.id === MISSING_FOREIGN_KEY) return;
        const [tetroDiv]  = dom(`<div class="tetromino ${tetromino.shapeName}" data-id="${tetromino.id}"></div>`);
        const [coordsDiv] = select(main, ".coords");
        coordsDiv.append(tetroDiv);
    });
    gameController.onTetrominoRemoved( tetromino => {
        const div = main.querySelector(`[data-id="${tetromino.id}"]`);
        if (!div){
            log.warn("cannot find view to remove tetromino " + JSON.stringify(tetromino));
            return;
        }
        div.remove();
    });

    gameController.onBoxAdded( box=> {
        if (box.id === MISSING_FOREIGN_KEY) return;
        const tetroDiv    = main.querySelector(`[data-id="${box.tetroId}"]`);  //maybe: if not there create it?
        const boxFaceDivs = 6..times( _=> "<div class='face'></div>").join("");
        const [boxDiv]    = dom(`<div class="box" data-id="${box.id}">${boxFaceDivs}</div>`);
        boxDiv.style      = `--x:${box.xPos};--y:${box.yPos};--z:${box.zPos};`;
        tetroDiv.append(boxDiv);
    });
    gameController.onBoxRemoved( box=> {
        const boxDiv      = main.querySelector(`.box[data-id="${box.id}"]`);
        boxDiv.remove();
        // maybe remove tetro if it has no more children
    });
    gameController.onBoxChanged( box=> {
        if (box.id === MISSING_FOREIGN_KEY) return;
        const boxDiv = main.querySelector(`.box[data-id="${box.id}"]`);
        boxDiv.style = `--x:${box.xPos};--y:${box.yPos};--z:${box.zPos};`;
    });


    return mainElements;
};


/**
 * Key binding for the game (view binding).
 * @collaborators document, game controller, and tetromino controller
 * @impure prevents the key default behavior, will indirectly change the game state and the visualization
 * @param { GameControllerType } gameController
 */
const registerKeyListener = (gameController) => {
    document.onkeydown = keyEvt => {    // note: must be on document since not all elements listen for keydown
        if(keyEvt.ctrlKey || keyEvt.metaKey) { return; }  // allow ctrl-alt-c and other dev tool keys
        if(! gameController.playerController.areWeInCharge()) {
            gameController.playerController.takeCharge();
            return; // we want keystrokes only to be applied after we have become in charge
        }
        if (keyEvt.shiftKey) {
            switch (keyEvt.key) {
                case "Shift":       break; // ignore the initial shift signal
                case "ArrowRight":  keyEvt.preventDefault();gameController.turnShape(rotateYaw  ); break;
                case "ArrowLeft":   keyEvt.preventDefault();gameController.turnShape(toppleRoll ); break;
                case "ArrowUp":     keyEvt.preventDefault();gameController.turnShape(topplePitch); break;
                case "ArrowDown":   keyEvt.preventDefault();gameController.movePosition(moveDown); break;
            }
        } else {
            switch (keyEvt.key) {
                case "ArrowLeft":   keyEvt.preventDefault();gameController.movePosition(moveLeft ); break;
                case "ArrowRight":  keyEvt.preventDefault();gameController.movePosition(moveRight); break;
                case "ArrowUp":     keyEvt.preventDefault();gameController.movePosition(moveBack ); break;
                case "ArrowDown":   keyEvt.preventDefault();gameController.movePosition(moveForw ); break;
            }
        }
    };
};


/**
 * @param { GameControllerType} gameController
 * @return { Array<HTMLElement> }
 */
const projectGame = gameController => {
    return [
        ...projectControlPanel(gameController),
        ...projectMain        (gameController)
    ];

};
