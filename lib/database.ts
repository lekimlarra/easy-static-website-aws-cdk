import * as cdk from "aws-cdk-lib";
import path = require("path");
import { AttributeType, Table, TableProps } from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";
// Custom imports
import * as utils from "./utils";

function filterJson(files: Array<string>): Array<string> {
  // Filter the files that are not json
  return files.filter((file) => file.includes(".json"));
}
const databasePath = path.join(__dirname, process.env.databasePath ?? "../resources/databases");
const defaultReadCapacity = 1;
const defaultWriteCapacity = 1;

export class database {
  allDBFiles = filterJson(utils.listFiles(databasePath));
  allTables: Table[] = [];
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    console.log("allDBFiles 2:", this.allDBFiles);
    for (let db of this.allDBFiles) {
      // Create the database from the json configuration file
      console.log("Creating DB:", db);
      const tableName = path.parse(db).name;
      const fileData = utils.loadJsonData(`${databasePath}/${db}`);
      const pk: string = fileData.pk;
      const pkType: AttributeType = fileData.pkType;
      const sk: string = fileData.sk;
      const skType: AttributeType = fileData.skType;
      let readCapacity: number = fileData.readCapacity;
      let writeCapacity: number = fileData.writeCapacity;
      if (!readCapacity) readCapacity = defaultReadCapacity;
      if (!writeCapacity) writeCapacity = defaultWriteCapacity;
      console.log(`\t Table namee: ${tableName}`);
      console.log(`\t Partition Key: ${pk} of type ${pkType}`);
      console.log(`\t Sort Key: ${sk} of type ${skType}`);
      console.log(`\t Read capacity: ${readCapacity}`);
      console.log(`\t Write capacity: ${writeCapacity}`);
      let tableProps: TableProps;
      // If we have a sort key, we create the table with it
      if (sk) {
        tableProps = {
          sortKey: { name: sk, type: skType },
          partitionKey: { name: pk, type: pkType },
          tableName: tableName,
          removalPolicy: cdk.RemovalPolicy.RETAIN,
          readCapacity: readCapacity,
          writeCapacity: writeCapacity,
        };
      } else {
        tableProps = {
          partitionKey: { name: pk, type: pkType },
          tableName: tableName,
          removalPolicy: cdk.RemovalPolicy.RETAIN,
          readCapacity: readCapacity,
          writeCapacity: writeCapacity,
        };
      }
      const tableCreated = new Table(scope, tableName, tableProps);
      this.allTables.push(tableCreated);
    }
  }
}
