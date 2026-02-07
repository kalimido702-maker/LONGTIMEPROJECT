export interface Migration {
  version: number;
  name: string;
  up(db: IDBDatabase, transaction: IDBTransaction): void;
  down?(db: IDBDatabase, transaction: IDBTransaction): void;
}
