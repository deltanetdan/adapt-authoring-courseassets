const AbstractApiModule = require('adapt-authoring-api');
const path = require('path');
/**
* Module which handles courseassets
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

    const assets = await this.app.waitForModule('assets');
    this.assets = assets;

    this.app.onReady().then(async () => {
      const content = await this.app.waitForModule('content');
      content.on('insert', this.insertContent.bind(this));
      content.on('delete', this.deleteContent.bind(this));
      content.on('update', this.updateContent.bind(this));
      content.on('replace', this.updateContent.bind(this));
    });

    this.setReady();
  }

  /** @override */
  async insert(data, options, mongoOptions) {

    if (typeof data !== 'object') throw new Error(this.app.lang.t('error.insertError'));
    if (!data._courseId || !data._contentId) throw new Error(this.app.lang.t('error.dataFormat'));
    const courseId = data._courseId;
    const contentId = data._contentId;
    const assetId = data._assetId;
    const assetData = {
      _courseId: courseId,
      _contentId: contentId,
      _assetId: assetId
    }

    try {
      const existingRecord = await this.find(assetData);

      if (!existingRecord || existingRecord.length === 0) {
        return await super.insert(assetData, options, mongoOptions);
      }

      return await this.updateAssetCount('insert', existingRecord[0]);
    } catch(e) {
      throw new Error(`Error creating courseasset, '${e.message}'`);
    }
  }


  /** @override */
  async delete(data, options, mongoOptions) {
    if (typeof data !== 'object') throw new Error(this.app.lang.t('error.deleteError'));

    try {
      const existingRecord = await this.find(data);
      if (!existingRecord || existingRecord.length === 0) throw new Error(this.app.lang.t('error.deleteMissing'));

      if (existingRecord[0].assetCount === 1) {
        return await super.delete({ _id: existingRecord._id });
      }

      return await this.updateAssetCount('delete', existingRecord[0]);

    } catch(e) {
      throw new Error(`Error deleting courseasset, '${e.message}'`);
    }
  }


  /**
   * Handler for inserted content event
   * @param {object} results
   */
  async insertContent(results) {

    if (typeof results != 'object') return;
    if (!results._courseId || !results._id) throw new Error(this.app.lang.t('error.dataFormat'));

    const courseId = results._courseId.toString();
    const contentId = results._id.toString();
    const fileArray = await this.assetSearch(results);

    if (!fileArray || fileArray.length === 0) return;

    // TODO seperate this out into async functions for readability
    const findAsset = async (assetName) => {

      await this.assets.find({ path: assetName })
        .then((assetRecords) => {
          if (!assetRecords || assetRecords.length == 0) throw new Error(this.app.lang.t('error.findAssetError'));
          const assetData = {
            _courseId: courseId,
            _contentId: contentId,
            _assetId: assetRecords[0]._id.toString()
          };

          return this.insert(assetData);
        })
        .catch((e) => {
          return e;
        });
    };

    const finalCourseAssets = fileArray.reduce((promiseChain, assetItem) =>
      promiseChain.then(() => findAsset(assetItem)), Promise.resolve());

    return finalCourseAssets;
  }


  /**
   * Handler for deleted content event
   * @param {object} results
   */
  async deleteContent(results) {
    const deletedContent = results[0];
    if (typeof deletedContent != 'object') return;
    if (!deletedContent._courseId || !deletedContent._id) throw new Error(this.app.lang.t('error.dataFormat'));

    const courseId = deletedContent._courseId.toString();
    const contentId = deletedContent._id.toString();

    if (deletedContent._type === 'course') {
      return await super.delete({ _courseId: courseId });
    }

    const fileArray = await this.assetSearch(deletedContent);

    if (!fileArray || fileArray.length === 0) return;

    // TODO seperate this out into async functions
    const findAsset = async (assetName) => {

      await this.assets.find({ path: assetName })
        .then((assetRecords) => {
          if (!assetRecords || assetRecords.length == 0) throw new Error(this.app.lang.t('error.findAssetError'));
          const assetData = {
            _courseId: courseId,
            _contentId: contentId,
            _assetId: assetRecords[0]._id.toString()
          };

          return this.delete(assetData);
        })
        .catch((e) => {
          return e;
        });
    };

    const finalCourseAssets = fileArray.reduce((promiseChain, assetItem) =>
      promiseChain.then(() => findAsset(assetItem)), Promise.resolve());

    return finalCourseAssets;

  }

  /**
   * Handler for patch and put content events
   * @param {object} results
   */
  async updateContent(originalDoc, results) {

    if (typeof results != 'object') return;
    if (!results._courseId || !results._id) throw new Error(this.app.lang.t('error.dataFormat'));

    const courseId = results._courseId.toString();
    const contentId = results._id.toString();
    const assetData = {
      _courseId: courseId,
      _contentId: contentId
    };

    // Delete existing courseasset records for this content record
    const existingRecords = await this.find(assetData);

    const deleteCourseassets = async (courseasset) => {
      await this.delete(courseasset)
        .then((deleted) => {
          return deleted;
        })
        .catch((e) => {
          return e;
        });
    };

    existingRecords.reduce((promiseChain, assetItem) =>
      promiseChain.then(() => deleteCourseassets(assetItem)), Promise.resolve());

    return await this.insertContent(results);
  }


  /**
  * Search data object for asset types
  * @param {Object} data
  */
  async assetSearch(data) {
    // TODO deal with asset types using schema:  const schema = await this.getContentSchema(data); OR use use recursive find
    if (typeof data !== 'object' || !data.hasOwnProperty('_type')) return;

    const dataString = JSON.stringify(data);
    let courseassets = dataString.match(/(course\/)((\w)*\/)*(\w)*.[a-zA-Z0-9]+/gi);

    if (courseassets.length === 0) return;

    const matchingCourseAssets = courseassets
      .map(fullPath => {
        let fileName = path.basename(fullPath);
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
    const existingRecord = await this.find(query);

    if (!existingRecord || existingRecord.length == 0) return;
    let newCount = existingRecord[0].assetCount;

    switch(action) {
      case "insert":
        newCount++;
        return await this.update(query, { assetCount: newCount });
      case "delete":
        newCount--;
        if (newCount <= 0) return this.delete(query);
        return await this.update(query, { assetCount: newCount });
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
