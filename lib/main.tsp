import "../dist/index.js";

using TypeSpec.Reflection;

namespace Laravel;

namespace Validation {
  /**
   * @param format PHP's [`DateTime`](https://www.php.net/manual/en/class.datetime.php) class format string.
   *
   * @example
   * ```typespec
   * @dateFormat("Y-m-d\\TH:i:sp")
   * scalar appDateTime extends utcDateTime;
   * //=> "date_format:Y-m-d\\TH:i:sp"
   * ```
   */
  extern dec dateFormat(target: unknown, format: valueof string);
}
