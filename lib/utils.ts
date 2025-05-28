import * as fs from "fs";

/**
 *
 * @param directory
 * @returns
 */
export function listFiles(directory: string): string[] {
  try {
    const files = fs.readdirSync(directory);
    return files;
  } catch (error) {
    console.error("Error reading directory:", error);
    return [];
  }
}

/**
 *
 * @param lambdasList
 * @returns
 */
export function listMethods(lambdasList: string[]): string[] {
  try {
    // Reducimos listaLambdas a solo el primer elemento tras split por - y capitalizamos
    let methods: string[] = lambdasList.map((lambda) => lambda.split("-")[0].toUpperCase());
    // Convertimos el metodos en un set para eliminar duplicados y volvemos a convertir a array
    methods = Array.from(new Set(methods));
    return methods;
  } catch (error) {
    console.error("Error reading methods:", error);
    return [];
  }
}

/**
 * Función que crea el nombre del path del endpoint a partir del nombre del fichero
 * @param fileName
 * @returns
 */
export function createPath(fileName: string): string {
  // Transforma el texto en minúsculas y elimina los espacios
  // First we remove the extension
  fileName = fileName.split(".")[0];
  // If the file has # we remove what is after it
  if (fileName.includes("#")) {
    fileName = fileName.split("#")[0];
  }
  return fileName.toLowerCase().replace("-", "");
}

export function getEndpointPathVariables(fileName: string): string[] {
  let pathVariables: string[] = [];
  if (fileName.includes("#")) {
    pathVariables = fileName.split("#");
    // Removing the first element
    pathVariables.shift();
  }
  return pathVariables;
}

/**
 *
 * @param jsonPath File path of the file
 * @returns The JSON content
 */
export function loadJsonData(jsonPath: string): any {
  try {
    const data = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    if (!data.pk) throw new Error("No primary key found in JSON file");
    if (!data.pkType) throw new Error("No primary key type found in JSON file");
    return data;
  } catch (error) {
    console.error("Error reading JSON file:", error);
    return [];
  }
}
