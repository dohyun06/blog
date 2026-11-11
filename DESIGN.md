# blog 설계

Obsidian vault에서 `#blog` 태그가 붙은 노트만 골라 `https://dohyun06.is-a.dev/blog/`에 정적 사이트로 게시한다.

## 1. 전체 흐름

```
Mac (Obsidian)                       GitHub                      OCI 서버
obsidian-git 자동 commit ──push──▶  dohyun06/Obsidian  ◀──pull── blog-build.timer (5분마다)
                                                                   │
                                                                   ├─ collect.mjs : #blog 노트 + 참조 이미지만 content/로 복사
                                                                   ├─ quartz build : content/ → public/
                                                                   └─ rsync public/ → ~/blog/site
                                                                                         │
                                                         Caddy (기존 infra) /blog/* ─ file_server
```

- 새로 띄우는 서버 프로세스는 없다. 기존 Caddy가 정적 파일을 서빙한다.
- Obsidian 플러그인은 만들지 않는다. 게시 신호는 obsidian-git의 commit이다.
- 글을 내리려면 태그를 지우면 된다. 다음 빌드에서 사라진다.

## 2. 저장소 구성

이 폴더(`OCI/blog`)를 Quartz v4 저장소의 clone으로 만들고, 아래 파일만 추가한다.

```
blog/
├─ quartz/ , quartz.config.ts, quartz.layout.ts, package.json   ← Quartz 그대로 (태그 버전 고정)
├─ content/                    ← 빌드 때마다 collect.mjs가 다시 만든다. git에 넣지 않는다.
├─ scripts/collect.mjs         ← #blog 필터 (이 프로젝트에서 짜는 코드의 거의 전부)
├─ scripts/collect.test.mjs    ← 필터 규칙 테스트
└─ deploy/
   ├─ build.sh                 ← pull → collect → build → rsync
   ├─ blog-build.service
   └─ blog-build.timer
```

`quartz.config.ts`에서 바꿀 것:

| 항목 | 값 |
| --- | --- |
| `baseUrl` | `dohyun06.is-a.dev/blog` |
| `locale` | `ko-KR` |
| `pageTitle` | 블로그 이름 |
| `ignorePatterns` | 기본값 유지 (content/에 이미 걸러진 것만 들어온다) |

## 3. collect.mjs

**입력**: vault 경로. **출력**: `content/` (매번 비우고 새로 만든다).

### 3.1. 게시 대상 판정

다음 중 하나라도 맞으면 게시한다.

- frontmatter `tags`에 `blog` 또는 `blog/...`가 있다.
- 본문에 inline `#blog` 또는 `#blog/...`가 있다. 단, code block과 inline code 안의 것은 무시한다.

제외 폴더: `.`으로 시작하는 폴더, `Templates/`, `Excalidraw/`. 태그가 붙어 있어도 제외한다.
템플릿에 `#blog` 예시가 들어가 실수로 게시되는 일을 막기 위해서다.

### 3.2. 노트 변환

게시 대상 노트를 vault 내 경로 그대로 `content/`에 복사하면서 아래만 고친다.

| 원문 | 대상이 게시됨 | 대상이 게시 안 됨 |
| --- | --- | --- |
| `[[노트]]`, `[[노트#H\|표시]]` | 그대로 둔다 | 일반 텍스트(`표시` 또는 `노트`)로 바꾼다 |
| `![[노트]]` (노트 embed) | 그대로 둔다 | 지운다 |
| `![[img.png]]`, `![](Assets/img.png)` | 이미지를 `content/`의 같은 경로로 복사 | (이미지는 항상 복사) |
| ` ```dataview ` / ` ```dataviewjs ` 블록 | 지운다 | 지운다 |
| `.excalidraw` embed | 지운다 (자동 export가 꺼져 있어 쓸 이미지가 없다) | 지운다 |

- 링크 해석은 Obsidian과 같은 규칙을 쓴다: 경로가 있으면 경로로, 없으면 basename으로 찾는다.
  첨부 파일은 `Assets/`(app.json의 `attachmentFolderPath`)를 먼저 본다.
- `#blog` 태그 자체는 본문에서 지운다. 사이트의 태그 페이지에 "blog"가 의미 없이 생기는 것을 막는다.
- 이미지는 **게시 노트가 참조하는 것만** 복사한다. vault 전체를 content로 넘기면 Quartz가 `Assets/`의 모든 파일(58MB, 비공개 노트 이미지 포함)을 그대로 공개한다. 이것이 Quartz 필터 플러그인 대신 복사 스크립트를 쓰는 이유다.

### 3.3. 안전장치

- `--dry-run`: 게시될 노트와 이미지 목록만 출력한다. 처음 태그를 붙일 때 이걸로 확인한다.
- 게시 노트가 0개면 빌드를 중단한다 (vault clone이 깨졌을 때 사이트가 통째로 비는 것을 막는다).

### 3.4. 테스트

`node --test`로 판정·변환 규칙만 확인한다: code block 안 `#blog` 무시, 비게시 링크의 텍스트 변환, `|` 표시 텍스트 유지, 비게시 노트 embed 삭제, 이미지 수집.

## 4. 서버 (OCI)

### 4.1. 1회 설정

서버의 `~/infra`와 같은 사용자 홈에 `~/blog`를 둔다. 사용자는 `docker` 그룹에 속해 있어야 한다.

```bash
mkdir -p ~/blog/site                     # infra 배포 전에 만들어야 root 소유 폴더가 생기지 않는다
git clone <deploy key로 접근하는 Obsidian 저장소 주소> ~/blog/vault
git clone <이 저장소 주소> ~/blog/app
mkdir -p ~/.config/systemd/user
cp ~/blog/app/deploy/blog-build.* ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now blog-build.timer
sudo loginctl enable-linger "$USER"      # 로그아웃 상태에서도 user timer가 돈다
```

1. GitHub `dohyun06/Obsidian`에 **read-only deploy key**를 등록한다.
2. 위 명령을 실행한다. `rsync`와 `flock`(util-linux)이 서버에 있어야 한다.
3. infra 저장소의 변경(`/blog` 라우팅, `../blog/site:/srv/blog:ro` 볼륨)을 push한다. GitHub Actions가 `docker compose up -d`로 caddy를 재생성한다.

### 4.2. build.sh

`deploy/build.sh`가 vault를 pull하고, vault와 이 저장소의 HEAD가 지난 빌드와 같으면 끝낸다. 다르면 `node:22-alpine` 컨테이너에서 `collect.mjs`와 Quartz 빌드를 돌리고 `public/`을 `~/blog/site`로 rsync한다. `flock`으로 겹치는 실행을 막는다.

- Node를 서버에 설치하지 않고 컨테이너로 빌드한다. 서버의 다른 서비스도 전부 docker다.
- 빌드가 실패하면 rsync까지 가지 않으므로 이전 사이트가 그대로 남는다.
- obsidian-git이 몇 분마다 commit하므로, vault와 이 저장소의 HEAD가 같으면 빌드를 건너뛴다.
  (shortcut: 비게시 노트만 바뀐 commit에도 빌드가 돈다. 서버 부하가 문제가 되면 collect 결과의 hash를 비교한다.)

## 5. 작업 순서

1. Quartz clone, `quartz.config.ts` 수정, 로컬에서 샘플 노트 몇 개로 `npx quartz build --serve` 확인
2. `collect.mjs` + 테스트 작성, 실제 vault에 `--dry-run`
3. 실제 노트 2~3개에 `#blog`를 붙이고 로컬에서 렌더링 확인 (수식, 섹션 링크, 이미지)
4. 서버 설정 (4.1), timer 가동
5. 태그 하나 붙여 commit → 5분 안에 게시되는지 확인

## 6. 결정할 것 (기본값으로 진행 가능)

| 질문 | 기본값 | 대안 |
| --- | --- | --- |
| 주소 | `dohyun06.is-a.dev/blog` (DNS·인증서 추가 없음) | `blog.dohyun06.is-a.dev` (is-a.dev 저장소에 PR 필요) |
| URL 경로 | vault 경로 그대로 (`/blog/3.-Resource/GIST/...`) | 게시 글을 `content/` 최상위로 평탄화 (basename 중복 시 충돌) |
| 비게시 노트 링크 | 일반 텍스트 | 링크 유지(404) |

## 7. 현재 상태와 위험

- 태그는 Obsidian처럼 대소문자를 구분하지 않는다. 그래서 `4. Archive/Club/Infoteam/Blog/`의 `#Blog` 글 3개가 게시 대상이 된다.
- vault 노트 453개 중 243개에 dataview 블록, 185개에 수식이 있다. 블로그 글에도 들어갈 가능성이 높다. 수식은 Quartz가 KaTeX로 렌더링하고, dataview는 위 규칙대로 지워진다.
- `#blog` 노트가 비게시 노트를 `![[...]]`로 embed하면 그 부분이 사라진다. 글이 비어 보이면 dry-run 출력에서 확인한다.
- deploy key는 vault 전체를 읽을 수 있다. 서버가 뚫리면 vault 전체가 노출된다 (지금도 sync-server가 같은 서버에 vault 내용을 갖고 있으므로 위험 수준은 비슷하다).
