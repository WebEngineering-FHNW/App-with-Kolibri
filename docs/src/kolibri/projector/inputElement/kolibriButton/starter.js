import  { projectTextButton, BUTTON_CSS} from "./kolibriButtonProjector.js";
import  { KolibriButtonController }                  from "./kolibriButtonControler.js";
import {TEXT_BUTTON}                                 from "../../../util/dom.js";
import {DEFAULT, FOCUS, PROCESSING, FILLED, PRIMARY} from "./kolibriButtonModel.js";

export { start } // exported for testing purposes

// todo dk: this should go into the examples

const start = () => {

    const primaryButton =
        { type: TEXT_BUTTON, value: "Button", designSystem: FILLED, emphasis: PRIMARY, state: DEFAULT  };

    const controller = KolibriButtonController(primaryButton);
    return projectTextButton(controller);

};

// keep document-specific info out of the start function such that it is easier to test without
// side-effecting the execution environment
const primaryButtons = document.getElementById("primary-buttons");
if (null != primaryButtons) { // there is no such element when called via test case
    document.querySelector("head style").textContent += BUTTON_CSS;
    primaryButtons.append(...start());
}
