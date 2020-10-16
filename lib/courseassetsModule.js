const AbstractApiModule = require('adapt-authoring-api');
const path = require('path');
/**
* Module which handles tagging
* preserves legacy courseassets routes
* exposes methods to insert, update and delete courseassets
* @extends {AbstractApiModule}
*/
class CourseAssetsModule extends AbstractApiModule {
  /** @override */
  async setValues() {
    const server = await this.app.waitForModule('server');
    /** @ignore */ this.root = 'courseassets';
    /** @ignore */ this.schemaName = 'courseasset';
    /** @ignore */ this.collectionName = 'courseassets';
    /** @ignore */ this.router = server.api.createChildRouter('courseassets');
    this.useDefaultRouteConfig();

    /** @ignore */ this.routes = [
      ...this.routes,
      {
        route: '/course',
        handlers: { post: this.handleCreateRequest.bind(this) },
        permissions: { post: ['write:courseassets'] },
      }
    ];
  }
  /**
  * Initialise the module
  * @return {Promise}
  */
  async init() {
    /**
    * Store of all modules registered to use this plugin
    * @type {Array<AbstractModule>}
    */
    await super.init();
    this.registeredModules = [];

    this.setReady();
  }

  async registerModule(mod) {
    if(this.registeredModules.includes(mod)) {
      throw new Error(`Module '${mod.name}' already registered with authored module`);
    }
    if(!mod.isApiModule) {
      throw new Error(`Module '${mod.name}' must extend AbstractApiModule`);
    }

    this.registeredModules.push(mod);

    mod.insertHook.tap(d => this.assetSearch('insert', d));
    mod.updateHook.tap(d => this.assetSearch('update', d));
  }

  /** @override */
  async insert(data, options, mongoOptions) {
    //return super.insert(...args);
    return this.createCourseAsset(data, options, mongoOptions);
  }

  /** @override */
  async replace(...args) {
    return this.createCourseAsset(...args);
  }

  /** @override */
  async delete({ _id }, options, mongoOptions) {
    return this.deleteCourseAsset(_id, options, mongoOptions);
  }

  /**
   * Request handler for creating courseasset items
   * @param {ClientRequest} req
   * @param {ServerResponse} res
   * @param {Function} next
   * @return {Promise}
   */
  async handleCreateRequest(req, res, next) {
    console.log('course ID: ' + req.body._courseId);
    console.log('asset ID: ' + req.body._assetId);
    try {
      const { _courseId, _assetId } = req.body;
      const assetData = {
        _courseId: _courseId,
        _assetId: _assetId
      }
      this.insertCourseAsset(assetData);
      res.status(res.StatusCodes.Success.NoContent).end();
    } catch(e) {
      return next(e);
    }
  }


  async insertCourseAsset(courseasset) {
    console.log('insertCourseAsset');
    const existingRecord = await this.find(courseasset);
    console.log('existingRecord = ' + typeof existingRecord);
    console.log(existingRecord);
  }


  /**
  * Decrement reference count or deletes a courseasset record
  * @param {String} data
  */
  async deleteCourseAsset(data) {

  }

  /**
  * Create a courseasset record
  * @param {Object} data
  */
  async createCourseAsset(data) {
    if (typeof data !== 'object') return next(new Error(this.app.lang.t('error.emptyfields')));
    if (!data._courseId) return next(new Error(this.app.lang.t('error.emptyfields')));

    let query = {};
    if (data._assetId) {
      query = {}
    } else {
      query = {}
    }
    return;
  }

  /**
  * Search data object for asset types
  * @param {String} action
  * @param {Object} data
  */
  async assetSearch(action, data) {
    // @todo deal with asset types using schema:  const schema = await this.getContentSchema(data);
    if (typeof data !== 'object' || !data.hasOwnProperty('_type')) return;

    const contentType = data._type;
    // TODO QUESTION how do we deal with a new course that has no ID but has assets in the JSON,
    if (action === 'insert' && contentType === 'course') return;

    const courseId = contentType === 'course' ? data._id : data._courseId;
    const assets = await this.app.waitForModule('assets');

    //TODO use findFiles() recursive find
    const dataString = JSON.stringify(data);
    let courseassets = dataString.match(/(course\/)((\w)*\/)*(\w)*.[a-zA-Z0-9]+/gi);

    if (courseassets.length === 0) return;
    courseassets.filter

    const matchingCourseAssets = courseassets
      .map(fullPath => {
        // TODO what will be using to match assets ???????
        const fileName = path.basename(fullPath);
        const assetObj = assets.find({ path: fileName });
        return assetObj._id || false;
      });

    // TODO pass this to a seperate incrementDecrement function with action
    matchingCourseAssets.forEach((asset, i) => {
      console.log(asset);
      // if ID, CASE action (if insert or update increment, if delete decrement

      // if no ID insert new record

    });
  }



  /**
  * Recursive parse object, returns array of assets
  * @param {Object} obj
  */
  async findFiles(obj) {
    const isObject = val =>
        typeof val === 'object' && !Array.isArray(val);

    // TODO find a better regex
    const PATH_REXEX = new RegExp(/(course\/)((\w)*\/)*(\w)*.[a-zA-Z0-9]+/gi);

    const paths = (obj = {}) => {
      return Object.entries(obj)
        .reduce((courseAssets, [key, value]) =>
          {
            if (isObject(value)) {
              return paths(value);
            } else {
              return courseAssets.push(value)
            }
          }, []);
    }

    return paths(obj);
  }

  /**
  * Returns a JSON schema for the data object
  * @param {Object} data
  */
  async getContentSchema(data) {
    return (await this.app.waitForModule('content')).getSchema(data._type, data._type === 'course' ? data._id : data._courseId);
  }
}

module.exports = CourseAssetsModule;
