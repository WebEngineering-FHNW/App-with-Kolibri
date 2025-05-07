import {dom, select}                              from "../kolibri/util/dom.js";
import {registerForMouseAndTouch}                 from "./scene3D/scene.js";
import {projectNewTetronimo, registerKeyListener} from "./tetrominoProjector.js";
import {active, POISON_PILL, POISON_PILL_VALUE}   from "../server/S7-manyObs-SSE/remoteObservableMap.js";
import {makeRandomTetromino}                      from "./model.js";
import {LoggerFactory}                            from "../kolibri/logger/loggerFactory.js";
import {PLAYER_SELF_ID}                           from "./gameController.js";

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
        <div class="player">no player</div>
        <button>Start/Restart</button>
        <div class="playerList">
            <ul></ul>
        </div>
    </header>`);
    const [selfInput]       = select(view[0], "div.self input");
    const [activePlayerDiv] = select(view[0], "div.player");
    const [startButton]     = select(view[0], "button");
    const [playerList]      = select(view[0], "div.playerList > ul");

    // util
    // what to do if either the active player id changes or we change our own name while being active
    const onIdIsTheActivePlayer = (id, observable) => {
        observable.onChange( _ => {
            if (id === gameController.activePlayerIdObs.getValue().value) {
                activePlayerDiv.textContent = gameController.getPlayerName(id);
            }
        });
    };

    // data binding
    gameController.selfPlayerObs.onChange( ({value}) => {
        if (POISON_PILL_VALUE === value) return; // can happen on self-removal
        selfInput.value = value;
    });
    onIdIsTheActivePlayer(PLAYER_SELF_ID, gameController.selfPlayerObs);

    gameController.activePlayerIdObs.onChange( ({value}) => {
        activePlayerDiv.textContent = gameController.getPlayerName(value);
    });
    gameController.activePlayerIdObs.onChange( _remoteValue => {
        startButton.disabled = !gameController.weAreInCharge();
    });

    // whenever a player changes his/her name, let's see whether we have to update the current player
    gameController.playerListObs.onAdd( ({id, observable}) => { // named remote observable
        onIdIsTheActivePlayer(id, observable);
    });

    // this could go into a nested li-projector
    gameController.playerListObs.onAdd( ({id, observable}) => { // named remote value
        const [liView] = dom(`<li data-id="${id}">...</li>`);
        observable.onChange( remoteValue => {
            liView.textContent = remoteValue?.value ?? id;
        });
        playerList.append(liView);
    });
    gameController.playerListObs.onDel( ({id}) => { // named remote value
        const liViews = playerList.querySelectorAll(`li[data-id="${id}"]`); // there should be exactly one but better be safe
        for (const liView of liViews) {
            liView.remove();
            log.info(`removed view for player ${id}`);
        }
    });

    // view Binding
    selfInput.oninput = _event => {
        gameController.selfPlayerObs.setValue( active(selfInput.value) );
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

    gameController.tetrominoListObs.onAdd( ({id, observable}) => {
        console.warn("project add tetro", id);
        const [tetroDiv]  = dom(`<div class="tetromino" data-id="${id}"></div>`);
        const [coordsDiv] = select(document.body, "#main .coords"); // the main view must have been projected
        coordsDiv.append(tetroDiv);
        let tetroNeedsShapeName = true;
        observable.onChange( remoteValue => {
            /** @type { TetrominoModelType } */ const tetro = remoteValue.value; // just for clarity
            if(!tetro) return;
            if (tetroNeedsShapeName) {
                tetroDiv.classList.add(tetro.shapeName);
                tetroNeedsShapeName = false;
            }
        })
    });
    gameController.tetrominoListObs.onDel( ({id, observable}) => {
        console.warn("project del tetro", id);
        const [tetroDiv] = select(document.body, `#main .coords [data-id="${id}"]`);
        tetroDiv?.remove();
    });

    gameController.boxesListObs.onAdd( ({id, observable}) => {
        console.warn("project add box", id);
        const boxFaceDivs = 6..times( _=> "<div class='face'></div>").join("");
        const [boxDiv] = dom(`<div class="box" data-id="${id}"> ${ boxFaceDivs} </div>`);
        let boxNeedsAddingToTetro = true;
        observable.onChange( remoteValue => {
            /** @type { BoxModelType } */ const box = remoteValue.value; // just for clarity
            if (!box) return;
            if (POISON_PILL === remoteValue) {// deletion could also be handled elsewhere, but this looks appropriate
                boxDiv.remove();              // the tetro div could remain in the dom (?) after the last box vanished
                console.warn("removing box div", id);
                return;
            }
            if (box.tetroId && boxNeedsAddingToTetro){
                const [tetroDiv] = select(document.body, `.tetromino[data-id="${box.tetroId}"]`);
                tetroDiv.append(boxDiv);
                boxNeedsAddingToTetro = false;
            }
            boxDiv.setAttribute("style", `--x:${box.xPos};--y:${box.yPos};--z:${box.zPos};`);
        })
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
