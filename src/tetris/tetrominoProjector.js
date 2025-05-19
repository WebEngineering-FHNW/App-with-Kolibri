/**
 * @module tetris/tetrominoProjector
 * Visualization plus view and data binding for tetromino objects.
 */
import "../kolibri/util/array.js";
import {dom} from "../kolibri/util/dom.js";
import {moveBack, moveDown, moveForw, moveLeft, moveRight, rotateYaw, topplePitch, toppleRoll}
                                 from "./tetrominoController.js";
import {LoggerFactory}           from "../kolibri/logger/loggerFactory.js";

export {projectNewTetronimo };

const log = LoggerFactory("ch.fhnw.kolibri.tetris.tetrominoProjector");

/** @private html representation of the 6 faces that make up a box
 * @type { String }
 * @pure
 */
const boxFaceDivs = 6..times( _=> "<div class='face'></div>").join("");

/** @private creating a tetromino that mirrors the position of the current tetromino but stays at z=0.
 * @ipure
 * @return {HTMLCollection} the elements that visualize the ghost tetromino
 */
const ghostView = () => { // might need to go to the game projector and be bound there (there should be one per game)
    const boxDivStr = `<div class="box ghost"> ${ boxFaceDivs } </div>`;
    return dom(`
            <div class="tetromino" >
                ${ 4..times(_=> boxDivStr) } 
            </div>
        `);
};

/**
 * Visualize the tetromino as divs in the DOM with boxes as DIVs.
 * Binds the box coordinates to CSS custom properties for visual positioning (data binding).
 * Removes boxes that fall below the floor.
 * @pure
 * @param { TetronimoType } tetromino
 * @returns { Array<HTMLElement> } the bound tetromino view
 */
const projectNewTetronimo = tetromino => {
    log.debug(JSON.stringify(tetromino));
    // todo: after having received a notification about a new tetro (maybe created by ourselves)
    // ...
    const boxDivStr = `<div class="box ${tetromino.shapeName}"> ${ boxFaceDivs} </div>`;
    const [ tetroDiv ] = dom(`
            <div class="tetromino" data-id="${tetromino.id}" >
                ${ 4..times(_=> boxDivStr) } 
            </div>
        `);
    // data binding
    const boxDivs   = [...tetroDiv.children]; // make shallow copy to keep the index positions
    // console.log("boxDivs", boxDivs);
    // todo: add ghost view here

    // const ghostDivs = ghostView.children; // old

    // todo
    // tetromino.boxes.forEach( (box, idx) => {
    //     box.onChange( (pos, _oldPos, selfRemove) => {
    //             if(pos.z < 0) {             // for the view, this is the signal to remove the box div
    //                 boxDivs[idx].remove();  // remove the view (div)
    //                 if( tetroDiv.children.length < 1) { // if there are no more boxes for this tetro
    //                     tetroDiv.remove();              // ... remove the whole tetro div
    //                 }
    //                 selfRemove(); // finally, there is nothing more to listen to, and we remove this very listener itself
    //                 return;
    //             }
    //             boxDivs[idx]  .setAttribute("style",   `--x: ${pos.x};--y: ${pos.y};--z: ${pos.z};`);
    //             // ghostDivs[idx].setAttribute("style",   `--x: ${pos.x};--y: ${pos.y};--z: 0;`);
    //     });
    // });
    return [ /** @type { HTMLElement } */ tetroDiv ];
};

