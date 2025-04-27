import {dom, select}              from "../kolibri/util/dom.js";
import {registerForMouseAndTouch} from "./scene3D/scene.js";
import {registerKeyListener}      from "./tetronimoProjector.js";

export {projectGame};

/**
 * Create the control panel view and bind to the controller actions
 * @param { GameControllerType } gameController
 * @return { HTMLCollection }
 */
const projectControlPanel = gameController => {
    const view              = dom(`
    <header>
        <div class="player">no player</div>
        <button>Start/Restart</button>
    </header>`);
    const [activePlayerDiv] = select(view[0], "div.player");
    const [startButton]     = select(view[0], "button");

    // data binding
    gameController.activePlayerObs.onChange(({value}) => {
        activePlayerDiv.textContent = gameController.weAreInCharge() ? "myself" : value ?? "unknown";
    });
    gameController.activePlayerObs.onChange(_remoteValue => {
        startButton.disabled = !gameController.weAreInCharge();
    });

    // view Binding
    startButton.onclick = _ => alert("start to be implemented");

    return view;
};

/**
 * Create the main view and bind to the main key bindings
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

    return mainElements;
};

/**
 * @param { GameControllerType} gameController
 * @return { Array<HTMLElement> }
 */
const projectGame = gameController => {

    return [...projectControlPanel(gameController),
            ...projectMain(gameController)];

};
