import {registerForMouseAndTouch}                               from "./scene3D/scene.js";
import {normalize, swapXZ, swapYZ}                              from "./controller.js";
import {makeRandomTetromino}                                    from "./model.js";
import {Scheduler}                                              from "../kolibri/dataflow/dataflow.js";
import {Walk}                                                   from "../kolibri/sequence/constructors/range/range.js";

registerForMouseAndTouch(main);



const showTetronimoInDOM = tetronimo => {
    const parent   = document.querySelector(`.scene3d .coords`);
    const viewHtml = `
            <div class="tetromino ${tetronimo.shapeName}" data-id="${tetronimo.id}" style="--tetromino-x: 0;--tetromino-y: 0;--tetromino-z: 0;">
                <div class="box" style="--x: 0;--y: 0;--z: 0;"><div></div><div></div><div></div><div></div><div></div><div></div></div>
                <div class="box" style="--x: 0;--y: 0;--z: 0;"><div></div><div></div><div></div><div></div><div></div><div></div></div>
                <div class="box" style="--x: 0;--y: 0;--z: 0;"><div></div><div></div><div></div><div></div><div></div><div></div></div>
                <div class="box" style="--x: 0;--y: 0;--z: 0;"><div></div><div></div><div></div><div></div><div></div><div></div></div>
            </div>
        `;
    parent.innerHTML += viewHtml;
};


const move  = tetro => {
    const position = tetro.position.getValue();
    document.querySelector(`[data-id="${ tetro.id }"]`).setAttribute("style",
            `--tetromino-x: ${position.x};
             --tetromino-y: ${position.y};
             --tetromino-z: ${position.z};`
    );
    document.querySelector(`[data-id="${ tetro.id}"].ghost`)?.setAttribute("style",
            `--tetromino-x: ${position.x};
             --tetromino-y: ${position.y};
             --tetromino-z: 0;`
    );
};
const align = tetro => {
    const tetroView = document.querySelector(`[data-id="${ tetro.id }"]`);
    const ghostView = document.querySelector(`[data-id="${ tetro.id }"].ghost`);
    tetro.shape.setValue(normalize(tetro.shape.getValue()));
    tetroView.querySelectorAll(".box").forEach((box, idx) => {
        const boxOffset = tetro.shape.getValue()[idx];
        box.setAttribute("style",
                `--x: ${boxOffset.x}; 
                 --y: ${boxOffset.y};
                 --z: ${boxOffset.z};`
        );
    });
    ghostView?.querySelectorAll(".box").forEach((box, idx) => {
        const boxOffset = tetro.shape.getValue()[idx];
        box.setAttribute("style",
                `--x: ${boxOffset.x};
                 --y: ${boxOffset.y};
                 --z: 0;`
        );
    });
};

const toppleRoll  = tetro => tetro.shape.setValue(swapXZ(tetro.shape.getValue())) ;
const topplePitch = tetro => tetro.shape.setValue(swapYZ(tetro.shape.getValue()));
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
        const pos = currentTetromino.position;
        const val = pos.getValue();
        switch (keyEvt.key) {
            case "ArrowLeft":   pos.setValue( {x: val.x -1, y: val.y, z: val.z} );move(currentTetromino);break;
            case "ArrowRight":  pos.setValue( {x: val.x +1, y: val.y, z: val.z} );move(currentTetromino);break;
            case "ArrowUp":     pos.setValue( {x: val.x, y: val.y -1, z: val.z} );move(currentTetromino);break;
            case "ArrowDown":   pos.setValue( {x: val.x, y: val.y +1, z: val.z} );move(currentTetromino);break;
            default:            console.warn("unknown key", keyEvt.key);
        }
    }
};

const addGhost    = (currentTetromino) => {
    const dataId = currentTetromino.id;
    const tetroView = document.querySelector(`[data-id="${dataId}"]`);
    const clone     = tetroView.cloneNode(true);
    clone.classList.add("ghost");
    tetroView.parentElement.appendChild(clone);
};
const removeGhost = currentTetromino => {
    if ( ! currentTetromino) return;
    const dataId = currentTetromino.id;
    const tetroView = document.querySelector(`[data-id="${dataId}"].ghost`);
    tetroView?.remove();
};


let currentTetromino;
const makeNextTetro = () => {
    removeGhost(currentTetromino);
    currentTetromino = makeRandomTetromino();
    showTetronimoInDOM(currentTetromino);
    addGhost(currentTetromino);
    align(currentTetromino);
    move(currentTetromino);  // todo: publish to server
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
