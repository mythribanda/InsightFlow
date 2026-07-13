"""
Statistical analysis router.

POST /statistics/{session_id}/test
  Runs t-test, ANOVA, chi-square, or confidence interval calculations
  on the session's parsed dataset.
"""

import logging
from fastapi import APIRouter, HTTPException, Header

from state import session_data_store, verify_session_owner
from schemas import StatsRequest, StatsResponse
from src.statistics import (
    run_t_test,
    run_anova,
    run_chi_square,
    run_confidence_interval,
    run_z_test,
)

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/statistics/{session_id}/test", response_model=StatsResponse)
async def run_statistical_test(
    session_id: str,
    request: StatsRequest,
    x_user_id: str = Header(None),
) -> StatsResponse:
    """
    Execute a statistical test on the session's loaded dataset.
    """
    verify_session_owner(session_id, x_user_id)

    # 1. Retrieve session data
    df = session_data_store.get(session_id)
    if df is None:
        raise HTTPException(
            status_code=404,
            detail=(
                "No dataset found for this session. "
                "Upload a dataset or load a project first."
            ),
        )

    test_type = request.test_type.strip().lower()
    col = request.column
    group_col = request.group_column

    logger.info(
        f"[{session_id}] Stats test: type={test_type}, col={col}, group={group_col}"
    )

    try:
        if test_type == "t_test":
            if not group_col:
                raise HTTPException(
                    status_code=400,
                    detail="group_column is required for a t-test",
                )
            result = run_t_test(df, col, group_col)

        elif test_type == "z_test":
            if not group_col:
                raise HTTPException(
                    status_code=400,
                    detail="group_column is required for a z-test",
                )
            result = run_z_test(df, col, group_col)

        elif test_type == "anova":
            if not group_col:
                raise HTTPException(
                    status_code=400,
                    detail="group_column is required for ANOVA",
                )
            result = run_anova(df, col, group_col)

        elif test_type == "chi_square":
            if not group_col:
                raise HTTPException(
                    status_code=400,
                    detail="group_column (as the second categorical variable) is required for Chi-Square test",
                )
            result = run_chi_square(df, col, group_col)

        elif test_type == "confidence_interval":
            confidence = request.confidence if request.confidence is not None else 0.95
            if not (0.0 < confidence < 1.0):
                raise HTTPException(
                    status_code=400,
                    detail="confidence level must be between 0.0 and 1.0",
                )
            result = run_confidence_interval(df, col, confidence)

        else:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Unknown test_type '{request.test_type}'. Supported values: "
                    f"'t_test', 'anova', 'chi_square', 'confidence_interval'."
                ),
            )

        return StatsResponse(
            statistic=result["statistic"],
            p_value=result["p_value"],
            significant=result["significant"],
            interpretation=result["interpretation"],
            extra_info=result.get("extra_info"),
        )

    except ValueError as val_err:
        logger.warning(
            f"[{session_id}] Stats test validation warning: {val_err}"
        )
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as e:
        logger.error(
            f"[{session_id}] Stats test calculation error: {e}",
            exc_info=True,
        )
        raise HTTPException(
            status_code=500,
            detail=f"Statistical calculation failed: {str(e)}",
        )
