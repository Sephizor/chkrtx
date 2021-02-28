# ChkRTX

## Running
You will need to have Google Chrome installed and have [chromedriver](https://chromedriver.chromium.org/downloads) from Selenium on your PATH.

Either modify the existing settings.json file or create a new `settings.local.json` file and add products to check with the following structure:

```json
{
    "cards": [
        {
            "name": "string",
            "url": "string",
            "maxPrice?": "number"
        }
    ]
}
```

## Limitations
* Currently only works with Amazon URLs
