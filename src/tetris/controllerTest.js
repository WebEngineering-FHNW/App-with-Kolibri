/**
 * @module tetris/controllerTest
 */
import {TestSuite} from "../kolibri/util/test.js";
import {Tetronimo}             from "./model.js";
import {intersects, normalize} from "./controller.js";

const controllerSuite = TestSuite("tetris/model");

const normalizedShape0 = [
    {x: 0, y: 0, z: 0},
    {x: 0, y: 1, z: 0},
    {x: 1, y: 0, z: 0},
    {x: 1, y: 1, z: 0},
];
const tooHighShape0 = [
    {x: 0, y: 0, z: 42},
    {x: 0, y: 1, z: 42},
    {x: 1, y: 0, z: 42},
    {x: 1, y: 1, z: 42},
];
const tooLowShape0 = [
    {x: 0, y: 0, z: 0},
    {x: 0, y: 1, z: 0},
    {x: 1, y: 0, z: 0},
    {x: 1, y: 1, z: 0},
];

const ownPropEqual = (objA, objB) =>
    Object.getOwnPropertyNames(objA).every( name => objA[name] === objB[name]);

const shapeEqual= (shapeA, shapeB) =>
    shapeA.every( (positionA, idx) => ownPropEqual(positionA, shapeB[idx]) );

controllerSuite.add("normalize", assert => {
    assert.isTrue( shapeEqual( normalize(normalizedShape0), normalizedShape0));
    assert.isTrue( shapeEqual( normalize(tooHighShape0),    normalizedShape0));
    assert.isTrue( shapeEqual( normalize(tooLowShape0),     normalizedShape0));
});

controllerSuite.add("SShapeTetro collide", assert => {
    const sTetro = Tetronimo(3,0);
    assert.is(sTetro.shapeName, "shapeS");
    sTetro.setPosition( {x:0,y:0,z:0} );
    const spaceBoxes = [];
    assert.is(intersects(sTetro, spaceBoxes), false);  // there is nothing to collide with
    spaceBoxes.push(...(sTetro.boxes));
    assert.is(intersects(sTetro, spaceBoxes), true);   // we collide with our own positions
    const secondSTetro = Tetronimo(3,1);
    secondSTetro.setPosition( {x:1,y:1,z:0} ); // this should now snugly fit
    assert.is(intersects(secondSTetro, spaceBoxes), false);
});


controllerSuite.run();
