import {dom, select}               from "../kolibri/util/dom.js";
import {registerForMouseAndTouch}  from "./scene3D/scene.js";
import {registerKeyListener}                            from "./tetrominoProjector.js";
import {active, MISSING_FOREIGN_KEY, POISON_PILL_VALUE} from "../server/S7-manyObs-SSE/remoteObservableMap.js";
import {LoggerFactory}                                  from "../kolibri/logger/loggerFactory.js";
import {PLAYER_SELF_ID}            from "./gameController.js";
import {Player}                    from "./relationalModel.js";

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
        <div class="self"><input size=10 value="${gameController.getPlayerName(PLAYER_SELF_ID)}"></div>
        <button>Start/Restart</button>
        <div class="playerList">
            <ul></ul>
        </div>
        <div class="score">0</div>
    </header>`);

    const [header]          = view;
    const [selfInput]       = select(header, "div.self input");
    const [startButton]     = select(header, "button");
    const [playerList]      = select(header, "div.playerList > ul");
    const [scoreDiv]        = select(header, "div.score");

    // data binding


    gameController.onActivePlayerIdChanged( /** @type { ForeignKeyType } */ playerId => {
        log.info("active player changed to id " +  playerId);
        for(const li of playerList.children) {
            li.classList.remove("active");
            if (li.getAttribute("data-id") === playerId) {
                li.classList.add("active");
            }
        }
    });

    gameController.onActivePlayerIdChanged( _ => {
        if (gameController.areWeInCharge()) {
            header.classList.add("active");
        } else {
            header.classList.remove("active");
        }
    });

    // gameController.gameStateObs.onChange( /** @type { GameStateModelType } */ gameState => {
    //     scoreDiv.textContent = gameState.score;
    // });


    // this could go into a nested li-projector
    gameController.onPlayerAdded(player => {
        const [liView] = dom(`<li data-id="${player.id}">${player.name}</li>`);
        playerList.append(liView);
    });
    gameController.onPlayerRemoved( removedPlayer => {
        const li = playerList.querySelector(`[data-id="${removedPlayer.id}"]`);
        if (!li){
            log.warn("cannot find view to remove player "+JSON.stringify(removedPlayer));
            return;
        }
        li.remove();
    });
    gameController.onPlayerChanged( player  => {
        if(MISSING_FOREIGN_KEY === player.id) { return; }
        const li = playerList.querySelector(`[data-id="${player.id}"]`);
        if (!li){
            log.warn("cannot find view to change player "+JSON.stringify(player));
            return;
        }
        li.textContent = player.name;
    });

    gameController.onPlayerChanged( player  => {
        if(PLAYER_SELF_ID === player) {
            selfInput.value = player.name;
        }
    });

    // view Binding
    selfInput.oninput = _event => {
        gameController.setPlayerChanged(  Player(PLAYER_SELF_ID, selfInput.value) );
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

    gameController.tetrominoListObs.onAdd( tetrominoObs => {
        const [tetroDiv]  = dom(`<div class="tetromino" data-id="${tetrominoObs.id}"></div>`);
        const [coordsDiv] = select(document.body, "#main .coords"); // the main view must have been projected
        coordsDiv.append(tetroDiv);
        let tetroNeedsShapeName = true;
        tetrominoObs.onChange( /** @type { TetrominoModelType } */ tetromino => {
            if (POISON_PILL_VALUE === tetromino) {
                tetroDiv.remove();
                return;
            }
            if (tetroNeedsShapeName) {
                tetroDiv.classList.add(tetromino.shapeName);
                tetroNeedsShapeName = false;
            }
        })
    });

    // todo: maybe make the binding more stable such that the tetroDiv get added when a box needs it (but only once in total)
    gameController.boxesListObs.onAdd( boxObservable => {
        const boxFaceDivs = 6..times( _=> "<div class='face'></div>").join("");
        const [boxDiv]    = dom(`<div class="box" data-id="${boxObservable.id}"> ${ boxFaceDivs} </div>`);
        let boxNeedsAddingToTetro = true;
        boxObservable.onChange( /** @type { BoxModelType } */ box => {
            if (POISON_PILL_VALUE === box) {
                boxDiv.remove();              // the tetro div could remain in the dom (?) after the last box vanished
                return;
            }
            if (box.tetroId && boxNeedsAddingToTetro){
                const tetroDiv = document.body.querySelector(`.tetromino[data-id="${box.tetroId}"]`);
                if (tetroDiv) { // when info comes from remote, the sequence might be off and the tetro div is only available later
                    tetroDiv.append(boxDiv);
                    boxNeedsAddingToTetro = false;
                } else {
                    log.warn("tetro div for box missing: " + box.tetroId);
                }
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
        // ...projectMain        (gameController)
    ];

};
