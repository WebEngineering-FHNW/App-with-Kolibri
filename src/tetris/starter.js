import {registerForMouseAndTouch}                               from "./scene3D/scene.js";
import {normalize, swapXZ, swapYZ}                              from "./controller.js";
import {shape0, shapeF, shapeI, shapeL, shapeS, shapeT, shapeZ} from "./model.js";
import {Scheduler}                                              from "../kolibri/dataflow/dataflow.js";
import {Walk}                                                   from "../kolibri/sequence/constructors/range/range.js";

registerForMouseAndTouch(main);


const shapes     = [shapeI, shapeT, shape0, shapeS, shapeZ, shapeL, shapeF];
const shapeNames = ["shapeI", "shapeT", "shape0", "shapeS", "shapeZ", "shapeL", "shapeF"];

const makeTetronimo = (shape, idx, dataId) => {
    const result = ({
                        position: {x: 0, y: 0, z: 12},
                        shape:    shape,
                        dataId:   dataId
                    });
    const parent   = document.querySelector(`.scene3d .coords`);
    const viewHtml = `
            <div class="tetromino ${shapeNames[idx]}" data-id="${dataId}" style="--tetromino-x: 0;--tetromino-y: 0;--tetromino-z: 0;">
                <div class="box" style="--x: 0;--y: 0;--z: 0;"><div></div><div></div><div></div><div></div><div></div><div></div></div>
                <div class="box" style="--x: 0;--y: 0;--z: 0;"><div></div><div></div><div></div><div></div><div></div><div></div></div>
                <div class="box" style="--x: 0;--y: 0;--z: 0;"><div></div><div></div><div></div><div></div><div></div><div></div></div>
                <div class="box" style="--x: 0;--y: 0;--z: 0;"><div></div><div></div><div></div><div></div><div></div><div></div></div>
            </div>
        `;
    parent.innerHTML += viewHtml;
    return result;
};


const move  = tetro => {
    const position = tetro.position;
    document.querySelector(`[data-id="${ tetro.dataId }"]`).setAttribute("style",
            `--tetromino-x: ${position.x};
             --tetromino-y: ${position.y};
             --tetromino-z: ${position.z};`
    );
    document.querySelector(`[data-id="${ tetro.dataId}"].ghost`)?.setAttribute("style",
            `--tetromino-x: ${position.x};
             --tetromino-y: ${position.y};
             --tetromino-z: 0;`
    );
};
const align = tetro => {
    const tetroView = document.querySelector(`[data-id="${ tetro.dataId }"]`);
    const ghostView = document.querySelector(`[data-id="${ tetro.dataId }"].ghost`);
    tetro.shape     = normalize(tetro.shape);
    tetroView.querySelectorAll(".box").forEach((box, idx) => {
        box.setAttribute("style",
                `--x: ${(tetro.shape)[idx].x}; 
                 --y: ${(tetro.shape)[idx].y};
                 --z: ${(tetro.shape)[idx].z};`
        );
    });
    ghostView?.querySelectorAll(".box").forEach((box, idx) => {
        box.setAttribute("style",
                `--x: ${(tetro.shape)[idx].x};
                 --y: ${(tetro.shape)[idx].y};
                 --z: 0;`
        );
    });
};

const toppleRoll  = tetro => tetro.shape = swapXZ(tetro.shape);
const topplePitch = tetro => tetro.shape = swapYZ(tetro.shape);
const rotateYaw   = tetro => {
    toppleRoll(tetro);
    topplePitch(tetro);
    topplePitch(tetro);
    topplePitch(tetro);
    toppleRoll(tetro);
    toppleRoll(tetro);
    toppleRoll(tetro);
};

document.onkeydown = keyEvt => {
    keyEvt.preventDefault();
    if (keyEvt.shiftKey) {
        switch (keyEvt.key) {
            case "Shift":       break; // ignore the initial shift signal
            case "ArrowRight":  rotateYaw(currentTetromino);   align(currentTetromino);   break;
            case "ArrowLeft":   toppleRoll(currentTetromino);  align(currentTetromino);   break;
            case "ArrowUp":     topplePitch(currentTetromino); align(currentTetromino);   break;
            case "ArrowDown":   moveDown();                    move(currentTetromino);    break; // might change current tetro
            default:            console.warn("unknown key", keyEvt.key);
        }
    } else {
        switch (keyEvt.key) {
            case "ArrowLeft":   currentTetromino.position.x -= 1;move(currentTetromino);break;
            case "ArrowRight":  currentTetromino.position.x += 1;move(currentTetromino);break;
            case "ArrowUp":     currentTetromino.position.y -= 1;move(currentTetromino);break;
            case "ArrowDown":   currentTetromino.position.y += 1;move(currentTetromino);break;
            default:            console.warn("unknown key", keyEvt.key);
        }
    }
};

const addGhost    = dataId => {
    const tetroView = document.querySelector(`[data-id="${dataId}"]`);
    const clone     = tetroView.cloneNode(true);
    clone.classList.add("ghost");
    tetroView.parentElement.appendChild(clone);
};
const removeGhost = dataId => {
    const tetroView = document.querySelector(`[data-id="${dataId}"].ghost`);
    tetroView?.remove();
};


let currentTetromino;
let runningTetroNum = 0;
const makeNextTetro = () => {
    const idx = Math.floor(Math.random() * shapes.length);
    removeGhost(runningTetroNum);
    currentTetromino = makeTetronimo(shapes[idx], idx, ++runningTetroNum);
    addGhost(runningTetroNum);
    align(currentTetromino);
    move(currentTetromino);  // todo: publish to server
};

const scheduler = Scheduler();

const spaceBoxes = [];

const boxPositions = tetro => tetro.shape.map( box => ({
    x: box.x + tetro.position.x,
    y: box.y + tetro.position.y,
    z: box.z + tetro.position.z,
}));

const collides = tetronimo =>
    boxPositions(tetronimo).some( box =>
        box.z < 0 ||
        spaceBoxes.some( spaceBox =>
           spaceBox.x === box.x &&
           spaceBox.y === box.y &&
           spaceBox.z === box.z ));

const endOfGame = () => currentTetromino.position.z === 12 && collides(currentTetromino) ;

const handleFullLevel = () => {
    const isFull = level => spaceBoxes.filter( box => box.z === level).length === 7 * 7;
    const fullLevels = Walk(12).takeWhere( level => isFull(level));
    fullLevels.forEach$( level => {
        console.log("full level", level);
    })
};

function moveDown() {
    currentTetromino.position.z -= 1;
    if (collides(currentTetromino)) {
        currentTetromino.position.z += 1;                   // hold in old position
        spaceBoxes.push(...boxPositions(currentTetromino)); // put the current tetro boxes in the space
        handleFullLevel();
        makeNextTetro();
    }
}

const fallTask = done => {
    moveDown();
    if (endOfGame()) {
        // handle end of game
        console.log("The End");
        return;
    }
    move(currentTetromino); // todo: send info to server
    // re-schedule fall Task
    setTimeout( () => scheduler.add(fallTask), 1 * 1000 );
    done();
};

makeNextTetro();
scheduler.add(fallTask);

// inspection setting
// removeGhost(tetroNum);
// --tetroNum
// currentTetromino = tetrominos[tetroNum];
// addGhost(tetroNum);
// currentTetromino.position.z = 0;
// move(currentTetromino);
