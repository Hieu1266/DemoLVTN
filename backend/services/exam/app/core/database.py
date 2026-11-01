from sqlalchemy import text
from sqlmodel import create_engine, SQLModel, Session, select, func
from app.core.config import settings

# Import đầy đủ các models để SQLModel khởi tạo metadata
from app.models.status_catalog import StatusCatalog, ExamStatus
from app.models.exam import Exam
from app.models.question import Question
from app.models.attempt import Attempt
from app.models.attempt_answer import AttemptAnswer


engine = create_engine(
    settings.EXAM_DB_URL,
    pool_size=50,
    max_overflow=100    ,
    pool_timeout=60,
    pool_recycle=1800,
    pool_pre_ping=True,
)


def get_db():
    with Session(engine) as session:
        yield session


def init_db() -> None:
    # 1. Tạo tự động các bảng trong Postgres
    SQLModel.metadata.create_all(engine)

    # Migration nhẹ (kiểm tra tồn tại trước khi chạy DDL để pod mới do autoscaling tạo ra
    # không giữ khóa bảng mỗi lần khởi động)
    with engine.begin() as conn:
        has_col = conn.execute(text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = 'exam' AND column_name = 'max_attempts'"
        )).first()
        if not has_col:
            conn.execute(text(
                "ALTER TABLE exam ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 1"
            ))

    # Chỉ mục phục vụ phân trang danh sách bài nộp (lọc theo đề, sắp xếp theo thời gian)
    indexes = {
        "ix_attempt_exam_submitted": "CREATE INDEX ix_attempt_exam_submitted ON attempt (exam_id, submitted_at DESC)",
        "ix_attempt_exam_started": "CREATE INDEX ix_attempt_exam_started ON attempt (exam_id, started_at DESC)",
    }
    for name, ddl in indexes.items():
        try:
            with engine.begin() as conn:
                exists = conn.execute(
                    text("SELECT 1 FROM pg_indexes WHERE indexname = :n"), {"n": name}
                ).first()
                if not exists:
                    conn.execute(text(ddl))
        except Exception as exc:  # pod khác đang tạo cùng lúc: bỏ qua, không làm sập khởi động
            print(f"[init_db] bỏ qua tạo chỉ mục {name}: {exc}")

    # 2. Seed dữ liệu danh mục trạng thái đề thi
    with Session(engine) as session:
        statement = select(func.count()).select_from(StatusCatalog)
        status_count = session.exec(statement).one()

        if status_count == 0:
            print("Exam Database trống! Đang tiến hành tạo danh mục trạng thái đề thi mặc định...")

            draft_status = StatusCatalog(
                status_id="DRAFT",
                status_name="Bản nháp",  # 👈 Sửa thành status_name
                description="Đề thi đang trong quá trình biên soạn"
            )
            published_status = StatusCatalog(
                status_id="PUBLISHED",
                status_name="Đã xuất bản",  # 👈 Sửa thành status_name
                description="Đề thi sẵn sàng cho sinh viên làm bài"
            )
            closed_status = StatusCatalog(
                status_id="CLOSED",
                status_name="Đã đóng",  # 👈 Sửa thành status_name
                description="Đề thi đã hết hạn làm bài"
            )

            session.add(draft_status)
            session.add(published_status)
            session.add(closed_status)
            session.commit()
            print("Khởi tạo danh mục trạng thái cho Exam Service thành công!")
        else:
            print("Exam Database đã được khởi tạo trước đó. Bỏ qua bước seed dữ liệu danh mục.")