/**
 * @module tetris/tetronimoControllerTest
 */
import {TestSuite}                        from "../kolibri/util/test.js";
import {Tetronimo}                        from "./model.js";
import {intersects, normalize, rotateYaw} from "./tetronimoController.js";
import {shapeEqual}                       from "./util.js";
import {passive}                          from "../server/S7-manyObs-SSE/remoteObservableClient.js";

const controllerSuite = TestSuite("tetris/tetronimoControl");

controllerSuite.add("normalize", assert => {
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
        {x: 0, y: 0, z: -42},
        {x: 0, y: 1, z: -42},
        {x: 1, y: 0, z: -42},
        {x: 1, y: 1, z: -42},
    ];
    assert.isTrue( shapeEqual( normalize(normalizedShape0), normalizedShape0));
    assert.isTrue( shapeEqual( normalize(tooHighShape0),    normalizedShape0));
    assert.isTrue( shapeEqual( normalize(tooLowShape0),     normalizedShape0));
});

controllerSuite.add("SShapeTetro collide", assert => {
    const sTetro = /** @type { RemoteValueType<TetronimoType> } */ passive(Tetronimo(3,0));
    assert.is(sTetro.value.shapeName, "shapeS");
    sTetro.value.setPosition( {x:0,y:0,z:0} );
    const spaceBoxes = [];
    assert.is(intersects(sTetro, spaceBoxes), false);  // there is nothing to collide with
    spaceBoxes.push(...(sTetro.value.boxes));
    assert.is(intersects(sTetro, spaceBoxes), true);   // we collide with our own positions
    const secondSTetro = /** @type { RemoteValueType<TetronimoType> } */ passive(Tetronimo(3,1));
    secondSTetro.value.setPosition( {x:1,y:1,z:0} );          // this should now snugly fit
    assert.is(intersects(secondSTetro, spaceBoxes), false);
});

controllerSuite.add("rotateYaw (incl roll/pitch)", assert => {
    const sTetro = /** @type { RemoteValueType<TetronimoType> } */ passive(Tetronimo(3,0));
    assert.is(sTetro.value.shapeName, "shapeS");
    sTetro.value.setPosition( {x:0,y:0,z:0} );
    const shapeS = [
        {x: 2, y: 0, z: 0},
        {x: 1, y: 0, z: 0},
        {x: 1, y: 1, z: 0},
        {x: 0, y: 1, z: 0},
    ];
    assert.isTrue( shapeEqual( sTetro.value.getShape(), shapeS ));

    const rotatedShapeS = [
        {x: 0, y: 0, z: 0},
        {x: 0, y: 1, z: 0},
        {x: 1, y: 1, z: 0},
        {x: 1, y: 2, z: 0},
    ];
    assert.isTrue( shapeEqual( normalize(rotateYaw(shapeS)), rotatedShapeS ));
});


controllerSuite.run();
