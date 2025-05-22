/**
 * @module tetris/player/playerModel
 */
import {MISSING_FOREIGN_KEY, PREFIX_IMMORTAL} from "../../extension/relationalModelType.js";
import {clientId}                             from "../../kolibri/version.js";
import {LoggerFactory}                        from "../../kolibri/logger/loggerFactory.js";
import {Observable, ObservableList} from "../../kolibri/observable.js";
import {NO_PLAYER, Player}          from "../relationalModel.js";

export { PlayerController }

const log = LoggerFactory("ch.fhnw.tetris.player.playerController");

const PLAYER_PREFIX    = "PLAYER-";
const PLAYER_ACTIVE_ID = /** @type { ForeignKeyType } */ PREFIX_IMMORTAL + "PLAYER_ACTIVE_ID";
const PLAYER_SELF_ID   = /** @type { ForeignKeyType } */ PLAYER_PREFIX + clientId;

/**
 * @typedef PlayerControllerType
 * @property onPlayerAdded
 * @property onPlayerRemoved
 * @property onPlayerChanged
 * @property setPlayerChanged
 * @property setWeChanged
 * @property onActivePlayerIdChanged
 * @property onWeHaveBecomeActive
 * @property isThereAnActivePlayer
 * @property areWeInCharge
 * @property takeCharge
 * @property getPlayerName
 * @property registerSelf
 * @property startListening
 * @property leave
 * @property thisIsUs
 * @property thisIsOurId
 * @property setOwnName
 */

/**
 * @constructor
 * @param { OMType } om
 * @param { Function } setValue
 * @param { () => void } onSetupFinished - callback when setup is finished as indicated by the fact that we ourselves have become known.
 * @returns { PlayerControllerType }
 */
const PlayerController = (om, setValue, onSetupFinished) => {

    // todo jsdoc types
    const publishPlayer = player => setValue(player.id, player);
    const publishReferrer = (referrer, reference) => setValue(referrer, reference);

    /**
     * @private
     * @type { Array<PlayerType> }
     */
    const knownPlayersBackingList = [];

    /** This is a local observable list to model the list of known players.
     *  Each entry is a remotely observable player name, such that we can change
     *  the name in place.
     * @type {IObservableList<PlayerType>}
     */
    const playerListObs = ObservableList(knownPlayersBackingList);

    /** publish all player value changes
     * @type {IObservable<PlayerType>} */
    const playerChangeObs = Observable(NO_PLAYER);

    /**
     * handle that a potentially new player has joined.
     * We maintain an observable list of known players.
     * @impure updates the playerListObs
     */
    const handlePlayerUpdate = player => {
        const knownPlayerIndex = knownPlayersBackingList.findIndex(it => it.id === player.id);
        if (knownPlayerIndex >= 0) {
            knownPlayersBackingList[knownPlayerIndex] = player;
        } else {
            log.info(`player joined: ${JSON.stringify(player)}`);
            playerListObs.add(player);
            if (player.id === PLAYER_SELF_ID) { // we are now known, which means the setup has finished
                onSetupFinished();
            }
            return;
        }
        playerChangeObs.setValue(player);// normal player value update
    };

    /** @type { IObservable<ActivePlayerIdType> }
     * foreign key (playerId) to the id of the player that is currently in charge of the game.
     */
    const activePlayerIdObs = Observable(MISSING_FOREIGN_KEY);

    const onWeHaveBecomeActive = callback => {
        activePlayerIdObs.onChange( playerId => {
           if (playerId === PLAYER_SELF_ID) { // we have become in charge
               callback();
           }
        });
    };

    /**
     * Whether we are in charge of moving the current tetromino.
     * @type { () => Boolean }
     * NB: when joining as a new player, the value might not yet be present,
     * but we are, of course, not in charge in that situation.
     */
    const areWeInCharge = () => activePlayerIdObs.getValue() === PLAYER_SELF_ID;

    /**
     * @impure puts us in charge and notifies all (remote) listeners.
     * @type { () => void }
     */
    const takeCharge = () => publishReferrer(PLAYER_ACTIVE_ID, PLAYER_SELF_ID);

    const getPlayerName = (playerId) => {
        const player = knownPlayersBackingList.find( it => it.id === playerId);
        return player ? player.name : "n/a";
    };

    const isThereAnActivePlayer = () => {
        return activePlayerIdObs.getValue() !== MISSING_FOREIGN_KEY;
    };

    const registerSelf = () => {            // make ourselves known to the crowd
        publishPlayer(Player(PLAYER_SELF_ID, PLAYER_SELF_ID.slice(-7) ) );
    };

    const thisIsOurId = playerId => PLAYER_SELF_ID === playerId;
    const thisIsUs    = player   => thisIsOurId(player?.id);

    const setOwnName = name => publishPlayer( Player(PLAYER_SELF_ID, name) );


    const leave = () => {
        om.removeKey(PLAYER_SELF_ID);
        if (areWeInCharge()) { // if we are in charge while leaving, put someone else in charge
            let nextCandidate = knownPlayersBackingList.at(0);
            if (thisIsUs(nextCandidate)) {          // if that is ourselves, try the next one
                nextCandidate = knownPlayersBackingList.at(1);
            }
            activePlayerIdObs.setValue(nextCandidate?.id ?? MISSING_FOREIGN_KEY);
        }
    };

    const startListening = () => {
        om.onKeyRemoved(key => {
            if (key.startsWith(PLAYER_PREFIX)) {
                const player = knownPlayersBackingList.find(it => it.id === key);
                playerListObs.del(player);
            }
        });

        om.onChange((key, value) => {
            if (key.startsWith(PLAYER_PREFIX)) {
                handlePlayerUpdate(value);
                return;
            }
            if (PLAYER_ACTIVE_ID === key) {
                activePlayerIdObs.setValue(value); // value is the id
                return;
            }
        });
    };


    return {
        onPlayerAdded:           playerListObs.onAdd,
        onPlayerRemoved:         playerListObs.onDel,
        onPlayerChanged:         playerChangeObs.onChange,
        setPlayerChanged:        publishPlayer,
        onActivePlayerIdChanged: activePlayerIdObs.onChange,
        onWeHaveBecomeActive,
        isThereAnActivePlayer,
        areWeInCharge,
        takeCharge,
        getPlayerName,
        registerSelf,
        leave,
        startListening,
        thisIsUs,
        thisIsOurId,
        setOwnName
    };
};

