/**
 * @module tetris/tetronimoProjector
 * Visualization plus view and data binding for tetronimo objects.
 */
import {dom}
                                 from "../kolibri/util/dom.js";
import {moveBack, moveDown, moveForw, moveLeft, moveRight, rotateYaw, topplePitch, toppleRoll}
                                 from "./tetronimoController.js";
import {movePosition, turnShape} from "./gameController.js";

export {projectNewTetronimo, registerKeyListener }

/** @private html representation of the 6 faces that make up a box
 * @type { String }
 * @pure
 */
const boxFaceDivs = 6..times( _=> "<div class='face'></div>").join("");

/** @private adding a tetronimo to the DOM that mirrors the position of the current tetronimo but stays at z=0.
 * @impure adds to the DOM
 * @type {HTMLDivElement} the element that visualizes the ghost tetronimo
 */
const ghostView = (() => {
    const parent    = document.querySelector(`.scene3d .coords`);
    const boxDivStr = `<div class="box ghost"> ${ boxFaceDivs } </div>`;
    const [ ghostDiv ] = dom(`
            <div class="tetromino" >
                ${ 4..times(_=> boxDivStr) } 
            </div>
        `);
    parent.append(ghostDiv);
    return ghostDiv;
})();

/**
 * Visualize the tetronimo as divs in the DOM with boxes as DIVs.
 * Binds the box coordinates to CSS custom properties for visual positioning (data binding).
 * Removes boxes that fall below the floor.
 * @impure changes the DOM now and in the future when the tetronimo boxes change
 * @param { TetronimoType } tetronimo
 */
const projectNewTetronimo = tetronimo => {
    console.dir(tetronimo);
    // todo: after having received a notification about a new tetro (maybe create by ourselves)
    // ...
    const parent    = document.querySelector(`.scene3d .coords`);
    const boxDivStr = `<div class="box ${tetronimo.shapeName}"> ${ boxFaceDivs} </div>`;
    const [ tetroDiv ] = dom(`
            <div class="tetromino" data-id="${tetronimo.id}" >
                ${ 4..times(_=> boxDivStr) } 
            </div>
        `);
    // data binding
    const boxDivs   = [...tetroDiv.children]; // make shallow copy to keep the index positions
    const ghostDivs = ghostView.children;
    tetronimo.boxes.forEach( (box, idx) => {
        box.onChange( (pos, _oldPos, selfRemove) => {
                if(pos.z < 0) {             // for the view, this is the signal to remove the box div
                    boxDivs[idx].remove();  // remove the view (div)
                    if( tetroDiv.children.length < 1) { // if there are no more boxes for this tetro
                        tetroDiv.remove();              // ... remove the whole tetro div
                    }
                    selfRemove(); // finally, there is nothing more to listen to, and we remove this very listener itself
                    return;
                }
                boxDivs[idx]  .setAttribute("style",   `--x: ${pos.x};--y: ${pos.y};--z: ${pos.z};`);
                ghostDivs[idx].setAttribute("style",   `--x: ${pos.x};--y: ${pos.y};--z: 0;`);
        });
    });
    parent.append(tetroDiv);
};

/**
 * Key binding for the game (view binding).
 * @collaborators document, game controller, and tetronimo controller
 * @impure prevents the key default behavior, will indirectly change the game state and the visualization
 */
const registerKeyListener = () => {
    document.onkeydown = keyEvt => {
        keyEvt.preventDefault();
        if (keyEvt.shiftKey) {
            switch (keyEvt.key) {
                case "Shift":       break; // ignore the initial shift signal
                case "ArrowRight":  turnShape(rotateYaw  ); break;
                case "ArrowLeft":   turnShape(toppleRoll ); break;
                case "ArrowUp":     turnShape(topplePitch); break;
                case "ArrowDown":   movePosition(moveDown); break;
                default:            console.warn("unknown key", keyEvt.key);
            }
        } else {
            switch (keyEvt.key) {
                case "ArrowLeft":   movePosition(moveLeft ); break;
                case "ArrowRight":  movePosition(moveRight); break;
                case "ArrowUp":     movePosition(moveBack ); break;
                case "ArrowDown":   movePosition(moveForw ); break;
                default:            console.warn("unknown key", keyEvt.key);
            }
        }
    };
};
