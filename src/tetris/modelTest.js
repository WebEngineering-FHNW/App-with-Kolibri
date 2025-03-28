/**
 * @module tetris/modelTest
 */
import {TestSuite} from "../kolibri/util/test.js";
import {Tetronimo} from "./model.js";

const modelSuite = TestSuite("tetris/model");

modelSuite.add("ctor", assert => {
    const tetro = Tetronimo(0,0);
    assert.is(tetro.shapeName, "shapeI");
    assert.is(tetro.boxes[0].position.getValue().x, 0);
    assert.is(tetro.boxes[0].position.getValue().y, 1);
    assert.is(tetro.boxes[0].position.getValue().z, 12);
});

modelSuite.run();
