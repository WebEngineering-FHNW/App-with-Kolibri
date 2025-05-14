
/** @typedef { (key:String) => void}                    newKeyCallback  */
/** @typedef { (key:String) => void}                    keyRemovedCallback  */
/** @typedef { <_T_> (key:String, value:_T_) => void}   onChangeCallback - value is never undefined */

/**
 * @typedef ObservableMap
 * @template _T_
 * @property { (key:String, value:_T_) => void}     setValue - implicit addKey
 * @property { (key:String) => MaybeType<_T_>}      getValue
 * @property { (key:String)=> void}                 removeKey
 * @property { (newKeyCallback)=> void}             onKeyAdded
 * @property { (keyRemovedCallback)=>void}          onKeyRemoved
 * @property { (onChangeCallback) => void }         onChange
 */

// ROM  = ObservableMap< RV <T> >
// getMode: (function injected) __mode__
