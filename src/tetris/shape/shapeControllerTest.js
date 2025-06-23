/**
 * @module tetris/tetrominoControllerTest
 */
import {TestSuite}            from "../../kolibri/util/test.js";
import {normalize, rotateYaw} from "./shapeController.js";
import {shapeEqual}           from "../util/util.js";

const controllerSuite = TestSuite("tetris/tetrominoControl");

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

controllerSuite.add("rotateYaw", assert => {

    const shapeS = [
        {x: 2, y: 0, z: 0},
        {x: 1, y: 0, z: 0},
        {x: 1, y: 1, z: 0},
        {x: 0, y: 1, z: 0},
    ];

    const rotatedShapeS = [
        {x: 0, y: 0, z: 0},
        {x: 0, y: 1, z: 0},
        {x: 1, y: 1, z: 0},
        {x: 1, y: 2, z: 0},
    ];
    assert.isTrue( shapeEqual( normalize(rotateYaw(shapeS)), rotatedShapeS ));
});


controllerSuite.run();
