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

    this.app.onReady().then(async () => {
      const content = await this.app.waitForModule('content');
      content.on('insert', this.insertContent.bind(this));
      content.on('delete', this.deleteContent.bind(this));
      //content.on('update', this.updateContent.bind(this));
      //content.on('replace', this.replaceContent.bind(this));
    });

    this.setReady();
  }

  /** @override */
  async insert(data, options, mongoOptions) {
    //return super.insert(...args);
    return this.handleCreateRequest(data, options, mongoOptions);
  }


  /** @override */
  async delete({ _id }, options, mongoOptions) {
    return this.handleDeleteRequest(_id, options, mongoOptions);
  }

  /**
   * Request handler for creating courseasset items
   * @param {object} data
   * @param {object} options
   * @param {object} mongoOptions
   * @return {Promise}
   */
  async handleCreateRequest(data, options, mongoOptions) {
    if (typeof data !== 'object') return new Error(this.app.lang.t('error.emptyfields'));
    const courseId = data._courseId;
    const assetId = data._assetId;
    const assetData = {
      _courseId: courseId,
      _assetId: assetId
    }

    try {
      const existingRecord = await this.find(assetData);

      if (!existingRecord || existingRecord.length === 0) return await super.insert(data, options, mongoOptions);

      return await this.updateAssetCount('insert', existingRecord[0]);
    } catch(e) {
      return new Error(`Error creating courseasset, '${e.message}'`);
    }
  }

  /**
   * Request handler for deleting courseasset items
   * @param {string} id
   * @param {object} options
   * @param {object} mongoOptions
   * @return {Promise}
   */
  async handleDeleteRequest(id, options, mongoOptions) {
    if (!id) return new Error(this.app.lang.t('error.emptyfields'));

    try {
      const existingRecord = await this.find({ _id: id });

      if (!existingRecord || existingRecord.length === 0) return new Error(this.app.lang.t('error.deleteerror'));

      if (existingRecord.assetCount === 1) return await super.delete({ _id: id });

      return await this.updateAssetCount('delete', existingRecord[0]);

    } catch(e) {
      return new Error(`Error deleting courseasset, '${e.message}'`);
    }
  }


  /**
   * Handler for inserted content
   * @param {object} results
   */
  async insertContent(results) {
    console.log(typeof results);
    console.log(results);
    if (typeof results != 'object') return;

    const fileArray = await this.assetSearch(results);
    let assetIdArray = [];
    if (!fileArray || fileArray.length === 0) return;

    // TODO pass this to a seperate incrementDecrement function with action
    fileArray.forEach((asset, i) => {
      console.log(asset);

      const assetObj = assets.find({ path: asset });
      console.log('assetObj ' + assetObj);
      if (!assetObj._id) return;
      console.log('assetObj._id ' + assetObj._id);
      return assetObj._id;
      // if ID, CASE action (if insert or update increment, if delete decrement

      // if no ID insert new record

    });


  }


  /**
   * Handler for deleted content
   * @param {object} results
   */
  async deleteContent(results) {
    console.log(typeof results);
    console.log(results);


  }


  /**
  * Search data object for asset types
  * @param {Object} data
  */
  async assetSearch(data) {
    // @todo deal with asset types using schema:  const schema = await this.getContentSchema(data);
    if (typeof data !== 'object' || !data.hasOwnProperty('_type')) return;

    //TODO use findFiles() recursive find
    const dataString = JSON.stringify(data);
    let courseassets = dataString.match(/(course\/)((\w)*\/)*(\w)*.[a-zA-Z0-9]+/gi);

    if (courseassets.length === 0) return;

    const assets = await this.app.waitForModule('assets');
    const matchingCourseAssets = courseassets
      .map(fullPath => {
        // TODO what will be using to match assets ???????
        let fileName = path.basename(fullPath);
        console.log('fileName ' + fileName);
        return fileName;
      })
      .filter(file => file && file.length > 0);

    return matchingCourseAssets;
  }


  /**
  * Handler for reference count on courseasset record
  * @param {String} action
  * @param {String} data
  */
  async updateAssetCount(action, data) {
    const query = { _id: data._id };
    let newCount = data.assetCount;

    switch(action) {
      case "insert":
        newCount++;
        return this.update(query, { assetCount: newCount });
      case "delete":
        newCount--;
        return this.update(query, { assetCount: newCount });
    }
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
