/**
 * @module tetris/gameControllerTest
 */
import {TestSuite}               from "../../kolibri/util/test.js";
import {checkAndHandleFullLevel} from "./gameController.js";
import {Observable}   from "../../kolibri/observable.js";
import {ownPropEqual} from "../util/util.js";

const controllerSuite = TestSuite("tetris/gameControl");

controllerSuite.add("full level", assert => {
    const spaceBoxes = [];
    checkAndHandleFullLevel(spaceBoxes);
    assert.is(spaceBoxes.length, 0);

    // todo: Observable
    (7*7).times( _ => spaceBoxes.push( Observable({x:0,y:0,z:0}) )); // lowest level is full
    spaceBoxes.push( Observable({x:0,y:0,z:2}) );                    // there is one element above
    assert.is(spaceBoxes.length, 7*7 + 1);
    checkAndHandleFullLevel(spaceBoxes);
    assert.is(spaceBoxes.length, 1);
    assert.isTrue(ownPropEqual(spaceBoxes[0].getValue(),{x:0,y:0,z:1} )); // remaining box above has moved one level down
});


controllerSuite.run();
