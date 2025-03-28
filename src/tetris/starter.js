import {registerForMouseAndTouch}  from "./scene3D/scene.js";
import {normalize, swapXZ, swapYZ} from "./controller.js";
import {makeRandomTetromino}       from "./model.js";
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
    const boxDivs   = tetroDiv .children;
    const ghostDivs = ghostView.children;
    tetronimo.boxes.forEach( (box, idx) => {
        box.position.onChange( pos => {
            boxDivs[idx]  .setAttribute("style", `--x: ${pos.x};--y: ${pos.y};--z: ${pos.z};`);
            ghostDivs[idx].setAttribute("style", `--x: ${pos.x};--y: ${pos.y};--z: 0;`);
        });
    });
    parent.append(tetroDiv);
};

const align = (tetro, newShape) => {
    tetro.shape.setValue(normalize(newShape));

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

document.onkeydown = keyEvt => {
    keyEvt.preventDefault();
    if (keyEvt.shiftKey) {
        switch (keyEvt.key) {
            case "Shift":       break; // ignore the initial shift signal
            case "ArrowRight":  align(currentTetromino, rotateYaw  (currentTetromino.shape.getValue())  );   break;
            case "ArrowLeft":   align(currentTetromino, toppleRoll (currentTetromino.shape.getValue()) );   break;
            case "ArrowUp":     align(currentTetromino, topplePitch(currentTetromino.shape.getValue()));   break;
            case "ArrowDown":   moveDown(); break;
            default:            console.warn("unknown key", keyEvt.key);
        }
    } else {
        const pos = currentTetromino.position;
        const val = pos.getValue();
        switch (keyEvt.key) {
            case "ArrowLeft":   pos.setValue( {x: val.x -1, y: val.y, z: val.z} );break;
            case "ArrowRight":  pos.setValue( {x: val.x +1, y: val.y, z: val.z} );break;
            case "ArrowUp":     pos.setValue( {x: val.x, y: val.y -1, z: val.z} );break;
            case "ArrowDown":   pos.setValue( {x: val.x, y: val.y +1, z: val.z} );break;
            default:            console.warn("unknown key", keyEvt.key);
        }
    }
};


let currentTetromino;
const makeNextTetro = () => {
    currentTetromino = makeRandomTetromino();
    tetronimoProjector(currentTetromino);
    align(currentTetromino, currentTetromino.shape.getValue());
};

const scheduler = Scheduler();

const spaceBoxes = [];

const collides = tetronimo =>
    tetronimo.boxes.some( ({ position: boxPos }) =>
        boxPos.getValue().z < 0 ||
        spaceBoxes.some( spaceBox =>
           spaceBox.position.getValue().x === boxPos.getValue().x &&
           spaceBox.position.getValue().y === boxPos.getValue().y &&
           spaceBox.position.getValue().z === boxPos.getValue().z ));

const endOfGame = () => currentTetromino.position.getValue().z === 12 && collides(currentTetromino) ;

const handleFullLevel = () => {
    const isFull = level => spaceBoxes.filter( box => box.position.getValue().z === level).length === 7 * 7;
    const fullLevels = Walk(12).takeWhere( level => isFull(level));
    fullLevels.forEach$( level => {
        console.log("full level", level);
    })
};

function moveDown() {
    const oldPos = currentTetromino.position.getValue();
    currentTetromino.position.setValue( {x: oldPos.x, y: oldPos.y, z: oldPos.z -1 } );
    if (collides(currentTetromino)) {
        currentTetromino.position.setValue(oldPos);   // hold in old position
        spaceBoxes.push(...(currentTetromino.boxes)); // put the current tetro boxes in the space
        handleFullLevel();
        makeNextTetro();
    }
}

const fallTask = done => {
    moveDown();
    if (endOfGame()) {
        console.log("The End");// handle end of game
        return;
    }
    // re-schedule fall Task
    setTimeout( () => scheduler.add(fallTask), 1 * 1000 );
    done();
};

makeNextTetro();
scheduler.add(fallTask);
