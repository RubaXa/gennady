/**
 * @purpose Определить, является ли файл тестовым по соглашениям имени.
 * @consumer core/utils
 * @param filename Имя или путь файла для проверки.
 * @returns true, если имя соответствует *.test.* или *.spec.* (с optional 's'); иначе false.
 */
export const isTestFile = (filename) => {
	return /\.(test|spec)s?\./.test(filename);
};

