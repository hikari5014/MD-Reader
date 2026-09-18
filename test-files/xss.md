# 惡意範例檔(測試消毒器)

<script>window.__mdrXss = 'script';</script>

<img src="x" onerror="window.__mdrXss = 'onerror'">

<a href="javascript:window.__mdrXss='link'">點我</a>

<iframe src="javascript:parent.__mdrXss='iframe'"></iframe>

<svg onload="window.__mdrXss='svg'"></svg>

[[javascript:window.__mdrXss='wikilink']]

![[javascript:alert(1)]]

正常內容:XSS-TEST-VISIBLE
