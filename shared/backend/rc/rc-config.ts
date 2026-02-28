import { readFileSync, existsSync } from 'node:fs';
import { join as pathJoin } from 'node:path';

/**
 * @purpose Описать конфигурацию одной AI-модели в rc-файле (имя, URL, опциональный ключ).
 * @consumer GennadyRc, ai-legacy
 */
export type RcModel = {
  model: string;
  url: string;
  key?: string;
};

/**
 * @purpose Корневая структура данных конфигурации Gennady RC (список моделей).
 * @consumer GennadyRc
 */
export type GennadyRcData = {
  models: RcModel[];
};

/**
 * @purpose Загрузить и парсить конфигурацию Gennady из rc-файла в заданной директории.
 * @consumer ai-legacy, CLI agent
 * @invariant При ошибке чтения/парсинга _error заполняется; getModels() возвращает пустой массив.
 * @sideEffect IO: чтение файла при конструкторе.
 */
export class GennadyRc {
  /** @purpose Имя файла конфигурации по умолчанию. */
  static DEFAULT_FILENAME = '.gennadyrc';

  /**
   * @purpose Создать экземпляры GennadyRc для текущей директории и HOME (приоритет поиска).
   * @returns Массив из двух экземпляров: [cwd, HOME].
   * @sideEffect IO: чтение файлов при конструкторе.
   */
  static getDefaults(): GennadyRc[] {
    return [process.cwd(), process.env.HOME].map((dir) => new GennadyRc(dir));
  }

  protected _filename = '';
  protected _data: GennadyRcData = {
    models: [],
  };
  protected _error: Error | null = null;

  constructor(dir = process.cwd(), name = GennadyRc.DEFAULT_FILENAME) {
    this._filename = pathJoin(dir, name);

    try {
      if (existsSync(this._filename)) {
        const data = JSON.parse(readFileSync(this._filename).toString()) as unknown;

        if (Array.isArray(data)) {
          this._data.models = data as RcModel[];
        } else if (
          data &&
          typeof data === 'object' &&
          Array.isArray((data as GennadyRcData).models)
        ) {
          this._data = {
            ...this._data,
            ...(data as GennadyRcData),
          };
        } else {
          this._error = new Error(
            `[GENNADY_RC_ERROR_CONFIG] Invalid "${this._filename}" config data`,
            { cause: data }
          );
        }
      }
    } catch (err) {
      this._error = new Error(`[GENNADY_RC_ERROR_PARSE] Read "${this._filename}" config failed`, {
        cause: err,
      });
    }
  }

  /**
   * @purpose Проверить, что конфигурация была успешно загружена и распознана.
   * @returns true, если ошибки нет; false при ошибке парсинга или невалидных данных.
   */
  isValid(): boolean {
    return !this._error;
  }

  /**
   * @purpose Получить список моделей из загруженного rc.
   * @returns Массив RcModel (пустой при ошибке или отсутствии файла).
   */
  getModels(): RcModel[] {
    return this._data.models;
  }

  /**
   * @purpose Получить ошибку загрузки/парсинга, если она произошла.
   * @returns Error или null при успешной загрузке.
   */
  getError(): Error | null {
    return this._error;
  }
}
