import {registerForMouseAndTouch}                          from "./scene3D/scene.js";
import {intersects, disallowed, normalize, swapXZ, swapYZ} from "./controller.js";
import {makeRandomTetromino, Tetronimo}                    from "./model.js";
import {Scheduler}                 from "../kolibri/dataflow/dataflow.js";
import {Walk}                      from "../kolibri/sequence/constructors/range/range.js";
import {dom}                       from "../kolibri/util/dom.js";

registerForMouseAndTouch(main);

const boxFaceDivs = 6..times( _=> "<div class='face'></div>").join("");
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

const tetronimoProjector = tetronimo => {
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
                        tetroDiv.remove();              // .. remove the whole tetro div
                    }
                    selfRemove(); // finally there is nothing more to listen to and we remove this very listener itself
                    return;
                }
                boxDivs[idx]  .setAttribute("style",   `--x: ${pos.x};--y: ${pos.y};--z: ${pos.z};`);
                ghostDivs[idx].setAttribute("style",   `--x: ${pos.x};--y: ${pos.y};--z: 0;`);
        });
    });
    parent.append(tetroDiv);
};


const spaceBoxes = [];

const handleCollision = (currentTetromino, spaceBoxes) => {
    currentTetromino.unlinkBoxes(); // boxes will still keep their data binding
    spaceBoxes.push(...(currentTetromino.boxes)); // put the current tetro boxes in the space
    checkAndHandleFullLevel(spaceBoxes);
    makeNextTetro();
};


const alignShape = (tetronimo, newShape, spaceBoxes) => {
        newShape = normalize(newShape);
        const shadowTetromino = Tetronimo(0,-1);
        shadowTetromino.setShape(newShape);
        shadowTetromino.setPosition(tetronimo.getPosition());
        if(disallowed(shadowTetromino)) { return; }
        if (intersects(shadowTetromino, spaceBoxes)) {
            handleCollision(tetronimo, spaceBoxes);
        } else {
            tetronimo.setShape(newShape);
        }
};
const alignPosition = (tetronimo, newPosition, spaceBoxes) => {
        const shadowTetromino = Tetronimo(0,-1);
        shadowTetromino.setShape(tetronimo.getShape());
        shadowTetromino.setPosition(newPosition);
        if(disallowed(shadowTetromino)) { return; }
        if (intersects(shadowTetromino, spaceBoxes)) {
            handleCollision(tetronimo, spaceBoxes);
        } else {
            tetronimo.setPosition(newPosition);
        }

};

const toppleRoll  = shape => swapXZ(shape);
const topplePitch = shape => swapYZ(shape);
const rotateYaw   = shape => {
    shape = toppleRoll (shape);
    shape = topplePitch(shape);
    shape = topplePitch(shape);
    shape = topplePitch(shape);
    shape = toppleRoll (shape);
    shape = toppleRoll (shape);
    shape = toppleRoll (shape);
    return shape;
};

// relies on two external references: currentTetronimo and spaceBoxes
document.onkeydown = keyEvt => {
    keyEvt.preventDefault();
    const pos   = currentTetromino.getPosition();
    const shape = currentTetromino.getShape();
    if (keyEvt.shiftKey) {
        switch (keyEvt.key) {
            case "Shift":       break; // ignore the initial shift signal
            case "ArrowRight":  alignShape(currentTetromino, rotateYaw  (shape), spaceBoxes);   break;
            case "ArrowLeft":   alignShape(currentTetromino, toppleRoll (shape), spaceBoxes);   break;
            case "ArrowUp":     alignShape(currentTetromino, topplePitch(shape), spaceBoxes);   break;
            case "ArrowDown":   alignPosition(currentTetromino, {x: pos.x, y: pos.y, z: pos.z - 1}, spaceBoxes); break;
            default:            console.warn("unknown key", keyEvt.key);
        }
    } else {
        switch (keyEvt.key) {
            case "ArrowLeft":   alignPosition(currentTetromino, {x: pos.x -1, y: pos.y, z: pos.z}, spaceBoxes );break;
            case "ArrowRight":  alignPosition(currentTetromino, {x: pos.x +1, y: pos.y, z: pos.z}, spaceBoxes );break;
            case "ArrowUp":     alignPosition(currentTetromino, {x: pos.x, y: pos.y -1, z: pos.z}, spaceBoxes );break;
            case "ArrowDown":   alignPosition(currentTetromino, {x: pos.x, y: pos.y +1, z: pos.z}, spaceBoxes );break;
            default:            console.warn("unknown key", keyEvt.key);
        }
    }
};

/** @type { TetronimoType } */
let currentTetromino;
const makeNextTetro = () => {
    currentTetromino = makeRandomTetromino();
    tetronimoProjector(currentTetromino);
};




const isEndOfGame = (currentTetromino, spaceBoxes) =>
    currentTetromino.getPosition().z === 12
    && intersects(currentTetromino, spaceBoxes) ;

/**
 * @impure side effects the spaceBoxes and the DOM if full level is detected
 * @param {Array<BoxType>} spaceBoxes
 */
const checkAndHandleFullLevel = spaceBoxes => {

    // const isFull = level => spaceBoxes.filter( box => box.getValue().z === level).length === 7 * 7; // assume no outside boxes
    const isFull = level => spaceBoxes.filter( box => box.getValue().z === level).length > 5; // assume no outside boxes
    const level = [...Walk(12)].findIndex(isFull);
    if (level < 0 ) { return; }

    // remove all boxes that are on this level from the spaceboxes and the view
    const toRemove = spaceBoxes.filter(box => box.getValue().z === level); // remove duplication
    toRemove.forEach( box => {
        spaceBoxes.removeItem(box);
        box.setValue( {x:-1,y:-1, z:-1} ); // will trigger the data binding to self-remove the view
    });

    // move the remaining higher boxes one level down
    spaceBoxes.forEach( box => {
        const pos = box.getValue();
        if (pos.z > level) {
            box.setValue( {x:pos.x,y:pos.y, z:pos.z-1} );
        }
    });
    // there might be more full levels
    checkAndHandleFullLevel(spaceBoxes);
};

const fallTask = done => {
    const oldPos = currentTetromino.getPosition();
    alignPosition(currentTetromino, {x: oldPos.x, y: oldPos.y, z: oldPos.z - 1}, spaceBoxes);
    if (isEndOfGame(currentTetromino, spaceBoxes)) {
        console.log("The End");// handle end of game
        return;
    }
    // re-schedule fall Task
    setTimeout( () => scheduler.add(fallTask), 1 * 1000 );
    done();
};

const scheduler = Scheduler();
makeNextTetro();
scheduler.add(fallTask);
