export type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | { [k: string]: JSONValue };

export type JSONObject = { [k: string]: JSONValue };
