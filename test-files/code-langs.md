# 程式碼上色測試

## JavaScript
```js
// 註解
const 名單 = ['佛手柑', '檀香'];
function greet(name) { return `你好,${name}`; }
```

## Python
```python
def blend(notes: list[str]) -> str:
    """調香"""
    return " + ".join(notes)  # 註解
```

## Shell
```bash
npm install && npm test
echo "完成"
```

## JSON
```json
{ "name": "MD隨手讀", "version": "0.2.0", "ok": true, "count": 3 }
```

## HTML
```html
<div class="card"><a href="#">連結</a></div>
```

## CSS
```css
.card { color: #7c5cff; margin: 0 auto; }
```

## SQL
```sql
SELECT name, price FROM materials WHERE price > 100 ORDER BY name;
```

## 沒指定語言
```
純文字區塊,不上色。
```

行內程式碼:`const x = 1;`
