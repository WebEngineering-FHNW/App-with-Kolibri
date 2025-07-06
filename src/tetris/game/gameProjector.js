import "../../kolibri/util/array.js";
import {dom, select}              from "../../kolibri/util/dom.js";
import {registerForMouseAndTouch} from "../scene3D/scene.js";
import {LoggerFactory}            from "../../kolibri/logger/loggerFactory.js";
import {MISSING_FOREIGN_KEY}      from "../../extension/relationalModelType.js";
import {projectPlayerList}        from "../player/playerProjector.js";
import {projectGameState}         from "../gameState/gameStateProjector.js";

export {projectGame};

const log = LoggerFactory("ch.fhnw.tetris.gameProjector");

/**
 * Create the control panel view and bind to the controller actions
 * @param { GameControllerType } gameController
 * @return { HTMLCollection }
 */
const projectControlPanel = gameController => {
    const view              = dom(`
    <header>
        <div class="self"><input size=10></div>
        <button disabled>Start/Restart</button>
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
            startButton.removeAttribute("disabled");
        } else {
            startButton.setAttribute("disabled", "");
        }
    });
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

    selfInput.oninput = _event => {
            playerController.setOwnName( selfInput.value );
    };

    // Using direct property assignment (onclick) overwrites any previous listeners
    // Only the last assignment will be executed when the button is clicked
    startButton.onclick = _ => {
        startButton.setAttribute("disabled", ""); // double-click protection
        gameController.restart( ()=> {
            if (!playerController.areWeInCharge()) return;
            startButton.removeAttribute("disabled");
        });
    };

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

    gameController.tetrominoController.onCurrentTetrominoIdChanged( tetroId => { // show ghost only if we have a current tetro
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
    gameController.tetrominoController.onTetrominoAdded( tetromino => {
        mayAddTetroDiv(tetromino);
    });
    gameController.tetrominoController.onTetrominoRemoved( tetromino => {
        const div = main.querySelector(`[data-id="${tetromino.id}"]`);
        if (!div){
            log.warn("cannot find view to remove tetromino " + JSON.stringify(tetromino));
            return;
        }
        setTimeout( _=> {
            div.remove();
        }, 2000); // todo take from config, must be aligned with CSS animations/transitions timing
    });

    const updateBoxDivPosition = (box, boxDiv) => {
        boxDiv.style = `--x:${box.xPos};--y:${box.yPos};--z:${box.zPos};`;
        const boxIdx = box.id.slice(-1); // 0..3 // not so nice. better: a box can maintain its index
        if (gameController.tetrominoController.isCurrentTetrominoId(box.tetroId)) { // when moving a current tetro box - also move the ghost
            const ghostBoxDiv = ghostBoxesDivs[Number(boxIdx)];
            ghostBoxDiv.style = `--x:${box.xPos};--y:${box.yPos};--z:0;`; // always mark the floor. more sophistication should go into a controller
        }
    };

    const handleNewBoxDiv = (box, count) => {
            if (box.id === MISSING_FOREIGN_KEY) return;
            if (count === undefined) count = 0;
            if (count++ > 4) {
                log.error(`cannot add box ${box.id} after ${count} retries`);
                return;
            } // max recursive count
            const tetroDiv    = mayAddTetroDiv(gameController.tetrominoController.findTetrominoById(box.tetroId));
            if (! tetroDiv) {
                // this is an indication of data inconsistency, and it might be better to do a full reload
                log.warn("cannot add box view since its tetromino view cannot be found or built." + box.id);
                setTimeout( _=> { // try again after a while
                   handleNewBoxDiv(box, count);
                }, count * 200);
                return;
            }
            const [boxDiv]    = dom(`<div class="box" data-id="${box.id}">${boxFaceDivs}</div>`);
            updateBoxDivPosition(box, boxDiv);
            tetroDiv.append(boxDiv);
    };
    gameController.boxController.onBoxAdded(handleNewBoxDiv);
    gameController.boxController.onBoxRemoved( box=> {
        const boxDiv   = main.querySelector(`.box[data-id="${box.id}"]`);
        if (!boxDiv) { // difficult to say when this might happen, but better be defensive
            log.error("cannot find div to remove for box id " + box.id);
            return;
        }
        boxDiv.classList.add("destroy");
        setTimeout( _=> { // remove only after visualization is done
            boxDiv.remove();
        }, 1500); // todo take from config, make sure it aligns with css anim/transition timing

    });
    gameController.boxController.onBoxChanged( box => {
        if (box.id === MISSING_FOREIGN_KEY) return;
        const boxDiv = main.querySelector(`.box[data-id="${box.id}"]`);
        if(!boxDiv) {
            log.debug("unknown div for box "+box.id+" . Likely, tetro has not been added, yet. Later updates will resolve this.");
            return;
        }
        updateBoxDivPosition(box, boxDiv);
    });
    return mainElements;
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
