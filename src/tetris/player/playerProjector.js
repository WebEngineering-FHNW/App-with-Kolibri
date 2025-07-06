import {dom, select}              from "../../kolibri/util/dom.js";
import {LoggerFactory}            from "../../kolibri/logger/loggerFactory.js";
import {MISSING_FOREIGN_KEY}      from "../../extension/relationalModelType.js";

export { projectPlayerList };

const log = LoggerFactory("ch.fhnw.tetris.playerProjector");

/**
 * @param { PlayerControllerType } playerController
 * @return { HTMLCollection }
 */
const projectPlayerList = playerController => {
    const view = dom(`
        <div class="playerList">
            <ul></ul>
        </div>
    `);
    const [playerList] = select(view[0], "ul");

    // data binding

    // give the active player the css class "active", remove it from all other player items
    playerController.onActivePlayerIdChanged(/** @type { ForeignKeyType } */ playerId => {
        for(const li of playerList.children) {
            li.classList.remove("active");
            if (li.getAttribute("data-id") === playerId) {
                li.classList.add("active");
            }
        }
    });

    // when active player changes - put him/her on top of the list
    playerController.onActivePlayerIdChanged(/** @type { ForeignKeyType } */ playerId => {
        if(MISSING_FOREIGN_KEY === playerId) { return; }
        const [activePlayerLi] = select(playerList, `[data-id="${playerId}"]`);
        if (!activePlayerLi) {
            return;
        }
        activePlayerLi.remove();
        playerList.prepend(activePlayerLi);
    });

    playerController.onPlayerAdded(player => {
        const [liView] = dom(`<li data-id="${player.id}">${player.name}</li>`);
        playerList.append(liView);
    });
    playerController.onPlayerRemoved( removedPlayer => {
        const [li] = select(playerList, `[data-id="${removedPlayer.id}"]`);
        li?.remove();
    });
    playerController.onPlayerChanged( player  => {
        if (MISSING_FOREIGN_KEY === player.id) return; // when starting
        const [li] = select(playerList, `[data-id="${player.id}"]`);
        li.textContent = player.name;
    });

    return view;
};
