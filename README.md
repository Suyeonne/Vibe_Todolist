# TODOlist

잡지 편집 디자인을 모티프로 만든 할일 목록 웹앱입니다. HTML, CSS, JavaScript만 사용했고 빌드 도구 없이 동작합니다. 할일은 Firebase Realtime Database에 저장되어 여러 기기에서 함께 볼 수 있습니다.

## 기능

- 할일 추가, 수정(더블클릭 또는 연필 아이콘), 삭제
- 중요도 체크 — 중요 항목은 연한 연두 배경과 연두색 번호로 표시되고 목록 위로 올라갑니다
- 완료 체크 — 완료 항목은 취소선과 함께 목록 아래로 내려갑니다
- 필터 — 전체 / 중요 / 진행중 / 완료
- 완료 항목 일괄 삭제
- 완료율 표시
- Realtime Database 실시간 동기화 — 다른 창에서 바꾼 내용이 새로고침 없이 반영됩니다
- 오프라인에서도 동작 — 연결이 안 되면 `localStorage`만으로 계속 쓸 수 있습니다


## 파일 구성

| 파일 | 역할 |
|---|---|
| `index.html` | 화면 구조 |
| `style.css` | 디자인. 맨 위 `:root`의 색상 변수만 바꾸면 전체 톤이 바뀝니다 |
| `script.js` | 할일 로직과 Realtime Database 동기화 |

## 데이터 구조

Realtime Database의 `/todos/{고유id}` 아래에 저장됩니다.

```json
{
  "text": "전시 도록 표지 시안 3개 그리기",
  "done": false,
  "important": true,
  "createdAt": 1756310400000
}
```

추가는 `set`, 수정과 체크는 `update`, 삭제는 `remove`를 쓰고 목록은 `onValue`로 실시간 수신합니다. 모든 동작은 화면과 `localStorage`에 먼저 반영한 뒤 서버로 보내는 로컬 우선 방식입니다.
