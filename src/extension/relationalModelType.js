
export { MISSING_FOREIGN_KEY, PREFIX_IMMORTAL }


/**
 * A string that can be used as an ID for pointing to other records or for other records pointing to us.
 * Such IDs usually have uniqueness constraints - either the id must be unique throughout
 * all records of one data type, or they need to be unique for remoting (often both).
 * @typedef { String } ForeignKeyType
 */

/**
 * Signal that a foreign key is missing. Support for referential integrity.
 * @type { ForeignKeyType }
 */
const MISSING_FOREIGN_KEY = "__MISSING_FOREIGN_KEY__";


/**
 * This string is used as a prefix to a {@link ForeignKeyType key} to signal that
 * this record is not to be deleted. Typically used for shared references that
 * live throughout the whole application.
 * @type { String }
 */
const PREFIX_IMMORTAL = "IMMORTAL-";
