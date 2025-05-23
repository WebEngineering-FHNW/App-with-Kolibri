import "../kolibri/util/array.js";
import {dom, select} from "../kolibri/util/dom.js";
import {
    registerForMouseAndTouch
}                    from "./scene3D/scene.js";
import {
    LoggerFactory
}                    from "../kolibri/logger/loggerFactory.js";
import {
    MISSING_FOREIGN_KEY
}                    from "../extension/relationalModelType.js";
import {
    moveBack,
    moveDown,
    moveForw,
    moveLeft,
    moveRight,
    rotateYaw,
    topplePitch,
    toppleRoll
}                    from "./tetrominoController.js";
import {
    projectPlayerList
}                    from "./player/playerProjector.js";
import {projectGameState} from "./gameState/gameStateProjector.js";

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
    header.append(...projectGameState(gameController.gameStateController));

    const [selfInput]       = select(header, "div.self input");
    const [startButton]     = select(header, "button");

    // data binding

    playerController.onActivePlayerIdChanged( _ => {
        if (playerController.areWeInCharge()) {
            header.classList.add("active");
        } else {
            header.classList.remove("active");
        }
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

    const boxFaceDivs = 6..times( _=> "<div class='face'></div>").join("");

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
                <div class="tetromino ghost" >
                    <div class="box">${boxFaceDivs}</div>   
                    <div class="box">${boxFaceDivs}</div>   
                    <div class="box">${boxFaceDivs}</div>   
                    <div class="box">${boxFaceDivs}</div>   
                </div>
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
    const [coordsDiv]          = select(main,     ".coords");
    const [ghostDiv]           = select(main,     ".ghost");
    const [...ghostBoxesDivs]  = select(ghostDiv, ".box");

    registerForMouseAndTouch(main);           // the general handling of living in a 3D scene
    registerKeyListener(gameController);      // the game-specific key bindings

    gameController.onCurrentTetrominoIdChanged( tetroId => { // show ghost only if we have a current tetro
        if (tetroId === MISSING_FOREIGN_KEY) {
            ghostDiv.classList.remove("show");
        } else {
            ghostDiv.classList.add("show");
        }
    });

    const mayAddTetroDiv = tetromino => {
        if (!tetromino) return;
        if (tetromino.id === MISSING_FOREIGN_KEY) return;
        const mayTetroDiv = main.querySelector(`.tetromino[data-id="${tetromino.id}"]`);
        if (mayTetroDiv) {
            return mayTetroDiv;
        }
        const [tetroDiv]  = dom(`<div class="tetromino ${tetromino.shapeName}" data-id="${tetromino.id}"></div>`);
        coordsDiv.append(tetroDiv);
        return tetroDiv;
    };
    gameController.onTetrominoAdded( tetromino => {
        mayAddTetroDiv(tetromino);
    });
    gameController.onTetrominoRemoved( tetromino => {
        const div = main.querySelector(`[data-id="${tetromino.id}"]`);
        if (!div){
            log.warn("cannot find view to remove tetromino " + JSON.stringify(tetromino));
            return;
        }
        setTimeout( _=> {
            div.remove();
        }, 1500); // todo take from config
        // div.remove();
    });

    const updateBoxDivPosition = (box, boxDiv) => {
        boxDiv.style = `--x:${box.xPos};--y:${box.yPos};--z:${box.zPos};`;
        const boxIdx = box.id.slice(-1); // 0..3 // not so nice. better: a box can maintain its index
        if (gameController.isCurrentTetrominoId(box.tetroId)) { // when moving a current tetro box - also move the ghost
            const ghostBoxDiv = ghostBoxesDivs[Number(boxIdx)];
            ghostBoxDiv.style = `--x:${box.xPos};--y:${box.yPos};--z:0;`; // always mark the floor. more sophistication should go into a controller
        }
    };

    gameController.onBoxAdded( box => {
        if (box.id === MISSING_FOREIGN_KEY) return;
        const tetroDiv    = mayAddTetroDiv(gameController.findTetrominoById(box.tetroId));
        if (! tetroDiv) {
            console.error("cannot add box view since its tetromino view cannot be found or built.", box.id);
            return;
        }
        const [boxDiv]    = dom(`<div class="box" data-id="${box.id}">${boxFaceDivs}</div>`);
        updateBoxDivPosition(boxDiv, box);
        tetroDiv.append(boxDiv);
    });
    gameController.onBoxRemoved( box=> {
        const boxDiv   = main.querySelector(`.box[data-id="${box.id}"]`);
        boxDiv.classList.add("destroy");
        setTimeout( _=> {
            boxDiv.remove();
        }, 1500); // todo take from config
        const tetroDiv = main.querySelector(`.tetromino[data-id="${box.tetroId}"]`); // remove tetro if it has no more children
        if (tetroDiv && tetroDiv.children.length < 1) {
            tetroDiv.remove();
        }
    });
    gameController.onBoxChanged( box=> {
        if (box.id === MISSING_FOREIGN_KEY) return;
        const boxDiv = main.querySelector(`.box[data-id="${box.id}"]`);
        updateBoxDivPosition(box, boxDiv);
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
