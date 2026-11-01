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
    pool_size=20,
    max_overflow=20,
    pool_timeout=10,            # lỗi nhanh thay vì chờ 60s
    pool_recycle=1800,
    pool_pre_ping=False,        # PgBouncer đã lo; bỏ 1 lần xếp hàng mỗi request
    connect_args={"prepare_threshold": None},  # không dùng prepared statement phía server (PgBouncer transaction mode)
)


def get_db():
    with Session(engine) as session:
        yield session


def init_db() -> None:
    # 1. Tạo tự động các bảng trong Postgres
    SQLModel.metadata.create_all(engine)

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